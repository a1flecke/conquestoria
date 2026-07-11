# World-Pressure Symmetry Implementation Plan

> **For agentic workers:** Execute ONE MR per fresh session using superpowers:executing-plans (inline). **NEVER dispatch subagents — this repo's CLAUDE.md Agent Policy forbids them.** Steps use checkbox (`- [ ]`) syntax for tracking. Each MR section below maps 1:1 to a GitHub issue; work only your MR's tasks.

**Goal:** AI civilizations experience the same crises and pirate pressure humans do — fairly scheduled, competently answered per difficulty, visible to the player, and eventually interactable — per `docs/superpowers/specs/2026-07-11-world-pressure-symmetry-design.md` (issue #526).

**Architecture:** Generalize the existing human-only crisis/threat pipeline in place (no parallel orchestrator). New severity resolver avoids the challenge-inversion trap; a deterministic `ai-crisis-response` policy module answers crises using the same helpers the human UI calls; interactions are a typed data table. Three staged feature flags keep unfinished stages dark.

**Tech Stack:** TypeScript, Vitest, Canvas 2D + DOM UI (existing app stack). No new dependencies.

## Global Constraints

- Run every command through `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)"`.
- Before any `git push`/`gh pr create`: `bash scripts/run-with-mise.sh yarn build` AND `yarn test` must both exit 0. `yarn test` does NOT type-check; only `yarn build` runs tsc.
- Bash timeouts: `git commit` 30 000 ms; `git push`/`gh pr create` 120 000 ms.
- All work in a git worktree; never commit to main. `mise trust <worktree>/mise.toml` before first push.
- NEVER `Math.random()` — seeded RNG only (LCG or `createRng`).
- Immutable turn processing: return new `GameState` via spread-copy; never mutate `state.cities[id] = ...` in systems.
- Diplomacy is bilateral: every relationship change applies to BOTH civs' `diplomacy.relationships`.
- Events are notifications: the state mutation must happen in the same block that emits the event.
- UI: `textContent`/`createTextNode` for dynamic text (never `innerHTML`); every button via `createGameButton()` from `src/ui/ui-kit.ts`; min-height 44px.
- Never hardcode `'player'`; use `state.currentPlayer` / per-viewer parameters.
- Tests live in `tests/` mirroring `src/` structure.
- PR titles reflect the subset shipped; PR bodies never say "closes #NNN" for a *future* MR's issue.
- Flavor text register: family game (ages 7+) — adventure-story tone, no grim prose.
- Any MR that changes yields/economy must re-run `tests/systems/pacing-audit.test.ts`.

## Verified codebase facts (read once, trust throughout)

| Fact | Where |
|---|---|
| Crisis scheduler (human-gated) | `processCrisisSchedulerForHumans` + `maybeStartCrisis`, `src/systems/crisis-system.ts:41-101` |
| Severity lookups to replace | `flavor.severityByChallenge[resolveChallengeForCiv(state, civId)]` at `crisis-system.ts:130, 156, 256, 278, 325, 338, 508` |
| Threat pressure human gates | `src/systems/threat-pressure-system.ts:81, 173, 233, 257, 355 (computeThreatScore), 803 (processThreatPressure)`. **Turn-loop entry:** `processIndependentThreatPressureForHumans` (`threat-pressure-system.ts:251`), called at `turn-manager.ts:965` — this wrapper owns the per-civ loop; `processThreatPressure` (`:796`) is per-civ. |
| Pressure ledger | `OpponentAIState.pressureByHuman: Record<string, HumanPressureLedger>` (`src/core/types.ts:1282`); normalizer reads it in `src/core/opponent-ai-state.ts:~304` |
| Challenge profiles | `OPPONENT_CHALLENGE_PROFILES`, `resolveChallengeForCiv`, `getChallengeProfileForCiv` in `src/core/opponent-challenge.ts` |
| Quarantine/remedy helpers (human UI calls these) | `applyQuarantine(state, crisisId, cityId)`, `applyRemedy(state, crisisId, cityId)`, `crisis-system.ts:592-640`; cost = `getCityAppeaseCost(city)` from `faction-system.ts` |
| Worker restoration | `canRestoreLand(tile, ownerId?, options)` `src/systems/improvement-system.ts:223`; action `'restore_land'` applied in `worker-action-system.ts:227` |
| AI plan portfolio | `AIPlanCandidate`, `AIPortfolioContext`, `refreshMajorCivPortfolio` in `src/ai/ai-plan-portfolio.ts` |
| Relationship helper | `modifyRelationship(diplomacyState, civId, delta)` `src/systems/diplomacy-system.ts:60` (clamps ±100; caller must apply to both civs) |
| Spy missions | `SpyMissionType` union `src/core/types.ts:715`; staged lists + `case` dispatch in `src/systems/espionage-system.ts:353, 441, 749` |
| Turn/game test fixture pattern | `tests/core/turn-manager-crisis.test.ts` — `createNewGame(undefined, seed, 'small')`, `foundCity`, `processTurn(state, new EventBus())` |
| `GameSettings` (optional-field precedent: `beastsMode?`) | `src/core/types.ts:1511` |
| Pirate fleet processing | `processPirateFleets`, `createPirateFleetNear` in `threat-pressure-system.ts` |
| Notification routing pattern | `src/ui/notification-routing.ts` (`routeFactionTransition` etc. — event → message + target) |
| Devastated-tile tint (fog-aware) | `src/renderer/hex-renderer.ts:446` |

---

## MR 0 — Prerequisite bug fixes (existing issues; 2 sessions suggested)

These are fully specified in their issues; no new plan detail needed here. Complete in this order:

1. **#521** (combat seed collisions) + **#519** (world-actor combat paths pass `buildCombatContextForDefender`) — one MR. Both touch the same call sites: `src/core/turn-manager.ts:754/759, 940/942`, `src/systems/pirate-system.ts:192-193`, `src/systems/minor-civ-system.ts:478-479, 770-771`, `src/ai/basic-ai.ts:389-390`, `src/main.ts:2457`. Export `deterministicCombatSeed` from `src/ai/ai-major-turn.ts:87` into `src/systems/combat-system.ts` and reuse.
2. **#522** (city-siege redesign: defense-mitigated damage, settled zero-HP consequence, HP regen) — one MR. Blocks MR 2 (AI cities get sieged).
3. **#520** (wrap-aware `mapDistance`/`mapNeighbors`/`mapHexesInRange` helpers in `hex-utils.ts` + migrate the spawn/AI call sites listed in the issue + its round-2 comment) — one MR. Blocks MR 3 (hunt spawns near AI cities).

Acceptance: all three issues' repro tests pass; `yarn build` + `yarn test` green.

---

## MR 1 — Pipeline generalization behind dark flags (zero behavior change)

**Issue theme:** rename/reshape only; with flags at defaults, every existing test passes unchanged. This MR is the parity seam the whole arc rests on.

### Task 1.1: World-pressure flags + resolver

**Files:**
- Modify: `src/core/types.ts:1511` (GameSettings — add 3 optional fields)
- Create: `src/systems/world-pressure-flags.ts`
- Test: `tests/systems/world-pressure-flags.test.ts`

**Interfaces (Produces):**
```ts
export type AiPressureFlag = 'off' | 'pirates' | 'full';
export type AiCrisisInteractionsFlag = 'off' | 'benign' | 'full';
export interface WorldPressureFlags {
  aiPressure: AiPressureFlag;
  aiPressureVisibility: boolean;
  aiCrisisInteractions: AiCrisisInteractionsFlag;
}
export function resolveWorldPressureFlags(settings: GameSettings | undefined): WorldPressureFlags;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/world-pressure-flags.test.ts
import { describe, it, expect } from 'vitest';
import { resolveWorldPressureFlags } from '@/systems/world-pressure-flags';
import type { GameSettings } from '@/core/types';

describe('resolveWorldPressureFlags', () => {
  it('defaults everything off for legacy saves (undefined settings fields)', () => {
    expect(resolveWorldPressureFlags({} as GameSettings)).toEqual({
      aiPressure: 'off', aiPressureVisibility: false, aiCrisisInteractions: 'off',
    });
    expect(resolveWorldPressureFlags(undefined)).toEqual({
      aiPressure: 'off', aiPressureVisibility: false, aiCrisisInteractions: 'off',
    });
  });
  it('passes explicit values through', () => {
    const settings = { aiPressure: 'pirates', aiPressureVisibility: true, aiCrisisInteractions: 'benign' } as GameSettings;
    expect(resolveWorldPressureFlags(settings)).toEqual({
      aiPressure: 'pirates', aiPressureVisibility: true, aiCrisisInteractions: 'benign',
    });
  });
});
```

- [ ] **Step 2: Run** `bash scripts/run-with-mise.sh yarn vitest run tests/systems/world-pressure-flags.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

In `types.ts` GameSettings (after `aiContestsBeasts?`):
```ts
  // World-pressure symmetry flags (#526). Optional: legacy saves resolve via
  // resolveWorldPressureFlags defaults — never read these fields directly.
  aiPressure?: 'off' | 'pirates' | 'full';
  aiPressureVisibility?: boolean;
  aiCrisisInteractions?: 'off' | 'benign' | 'full';
```

```ts
// src/systems/world-pressure-flags.ts
import type { GameSettings } from '@/core/types';

export type AiPressureFlag = 'off' | 'pirates' | 'full';
export type AiCrisisInteractionsFlag = 'off' | 'benign' | 'full';

export interface WorldPressureFlags {
  aiPressure: AiPressureFlag;
  aiPressureVisibility: boolean;
  aiCrisisInteractions: AiCrisisInteractionsFlag;
}

// Stage defaults: flipped by the final MR of each stage (MR 2/3 → aiPressure,
// MR 5 → visibility, MR 6/7 → interactions). Until then, dark.
export function resolveWorldPressureFlags(settings: GameSettings | undefined): WorldPressureFlags {
  return {
    aiPressure: settings?.aiPressure ?? 'off',
    aiPressureVisibility: settings?.aiPressureVisibility ?? false,
    aiCrisisInteractions: settings?.aiCrisisInteractions ?? 'off',
  };
}
```

- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(pressure): world-pressure flags + resolver (dark, #526 MR1)"`

### Task 1.2: Severity resolver (`resolvePressureSeverityForCiv`)

**Files:**
- Modify: `src/core/opponent-challenge.ts`
- Test: `tests/core/opponent-challenge.test.ts` (append)

**Interfaces (Produces):**
```ts
export function resolvePressureSeverityForCiv(
  state: Pick<GameState, 'opponentChallenge' | 'civilizations'>,
  civId: string,
): OpponentChallenge;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('resolvePressureSeverityForCiv', () => {
  it('returns the personal challenge for humans', () => {
    const state = { opponentChallenge: 'veteran', civilizations: {
      h1: { isHuman: true, challenge: 'explorer' },
    } } as any;
    expect(resolvePressureSeverityForCiv(state, 'h1')).toBe('explorer');
  });
  it('returns standard for AI even at veteran opponentChallenge (inversion trap)', () => {
    const state = { opponentChallenge: 'veteran', civilizations: {
      'ai-1': { isHuman: false },
    } } as any;
    expect(resolvePressureSeverityForCiv(state, 'ai-1')).toBe('standard');
    // Contrast: resolveChallengeForCiv would return 'veteran' here — that is
    // the inversion trap this function exists to avoid. See spec §severity.
  });
});
```

- [ ] **Step 2: Run** `bash scripts/run-with-mise.sh yarn vitest run tests/core/opponent-challenge.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** (in `opponent-challenge.ts`, beside `resolveChallengeForCiv`):

```ts
// Severity for world pressure (crises, pirate fleets). Humans: personal challenge.
// AI: ALWAYS 'standard' — never resolveChallengeForCiv, whose game-wide
// opponentChallenge would invert difficulty (veteran would make AI suffer MORE,
// making the game easier). Spec: docs/superpowers/specs/2026-07-11-world-pressure-symmetry-design.md
export function resolvePressureSeverityForCiv(
  state: Pick<GameState, 'opponentChallenge' | 'civilizations'>,
  civId: string,
): OpponentChallenge {
  const civ = state.civilizations[civId];
  if (civ?.isHuman) return resolveChallengeForCiv(state, civId);
  return 'standard';
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit.**

### Task 1.3: Swap every severity lookup in crisis/threat systems

**Files:**
- Modify: `src/systems/crisis-system.ts` (lines 130, 156, 256, 278, 325, 338, 508 — every `resolveChallengeForCiv` used for `severityByChallenge`/`devastationTurnsByChallenge`/outcome decisions about the TARGET civ)
- Modify: `src/ui/city-panel.ts` (grep `resolveChallengeForCiv` — the crisis severity display must use the same resolver so shown % matches applied %)
- Test: existing crisis tests are the parity net; add one new test

**Do NOT swap:** `getChallengeProfileForCiv` calls used for scheduling knobs of *humans* (`maybeStartCrisis` line 52) — those stay personal. AI scheduling knobs arrive in MR 3.

- [ ] **Step 1: Failing test** (append to `tests/systems/crisis-system.test.ts`):

```ts
it('resolves AI crisis severity as standard even when opponentChallenge is veteran', () => {
  const flavor = getCrisisFlavor('plague')!;
  const std = 1 - flavor.severityByChallenge.standard.yieldPenalty;
  const vet = 1 - flavor.severityByChallenge.veteran.yieldPenalty;
  expect(std).not.toBe(vet); // guard: the test is meaningful
  // Minimal literal state — getCrisisYieldMultiplier only reads activeCrises,
  // cities (for membership), civilizations, opponentChallenge.
  const state = {
    opponentChallenge: 'veteran',
    civilizations: { 'ai-1': { id: 'ai-1', isHuman: false } },
    cities: { 'ai-city': { id: 'ai-city' } },
    activeCrises: {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'ai-1',
        cityIds: ['ai-city'], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
      },
    },
  } as unknown as GameState;
  expect(getCrisisYieldMultiplier(state, 'ai-city')).toBeCloseTo(std);
});
```

- [ ] **Step 2: Run** crisis tests — Expected: new test FAILS (veteran multiplier applied).
- [ ] **Step 3: Implement** — mechanical: `import { resolvePressureSeverityForCiv } from '@/core/opponent-challenge'` and replace at the listed lines. `grep -n "resolveChallengeForCiv" src/systems/crisis-system.ts` afterward must return zero severity-context hits.
- [ ] **Step 4: Run FULL suite** `bash scripts/run-with-mise.sh yarn test` — every pre-existing test must still pass (humans resolve identically through both functions, so this is behavior-neutral for them).
- [ ] **Step 5: Commit.**

### Task 1.4: `pressureByHuman` → `pressureByCiv` rename + load migration

**Files:**
- Modify: `src/core/types.ts:1267-1282` (rename `HumanPressureLedger` → `CivPressureLedger`; field `pressureByHuman` → `pressureByCiv`)
- Modify: `src/core/opponent-ai-state.ts` (empty-state + normalizer: read `source.pressureByCiv ?? source.pressureByHuman`)
- Modify: all compile-error sites (`grep -rln "pressureByHuman" src/ tests/`) — mechanical rename
- Test: `tests/core/opponent-ai-state.test.ts` (append)

- [ ] **Step 1: Failing test**

```ts
it('migrates legacy pressureByHuman key on normalize', () => {
  // normalizeOpponentAIState is `(state: GameState) => GameState` (opponent-ai-state.ts:249).
  const opponentAI = { ...createEmptyOpponentAIState() } as any;
  delete opponentAI.pressureByCiv;
  opponentAI.pressureByHuman = { h1: { activeIndependentThreatIds: ['t1'], recoveryUntilTurn: 5, lastResolvedThreatTurn: 3, lastWarningTurnByKey: {}, lastStrategicAudioTurn: null } };
  const state = { opponentAI, civilizations: {} } as unknown as GameState;
  const normalized = normalizeOpponentAIState(state);
  expect(normalized.opponentAI!.pressureByCiv.h1.activeIndependentThreatIds).toEqual(['t1']);
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** rename + `?? source.pressureByHuman` fallback in the normalizer (one line at the existing read site, `opponent-ai-state.ts:~304`). **Step 4:** `yarn build` (catches every missed rename site) then `yarn test`. **Step 5: Commit.**

### Task 1.5: Eligibility helper + scheduler rename (flag-off parity)

**Files:**
- Create: `src/systems/world-pressure-eligibility.ts`
- Modify: `src/systems/crisis-system.ts:41-47` (rename `processCrisisSchedulerForHumans` → `processCrisisScheduler`, iterate eligible civs)
- Modify: `src/core/turn-manager.ts:965-966` (rename BOTH calls: `processIndependentThreatPressureForHumans` → `processIndependentThreatPressure`, `processCrisisSchedulerForHumans` → `processCrisisScheduler`)
- Modify: `src/systems/threat-pressure-system.ts:251` (rename `processIndependentThreatPressureForHumans` → `processIndependentThreatPressure`; its internal human filter switches to `isPiratePressureEligible`)
- Modify: `src/systems/threat-pressure-system.ts:81, 173, 233, 257, 355, 803` (replace `isHuman` checks with the helpers; `computeThreatScore` + `processThreatPressure` use pirate eligibility)
- Test: `tests/systems/world-pressure-eligibility.test.ts`

**Interfaces (Produces):**
```ts
export function isCrisisPressureEligible(state: GameState, civId: string): boolean; // human || flags.aiPressure === 'full'
export function isPiratePressureEligible(state: GameState, civId: string): boolean; // human || flags.aiPressure !== 'off'
export function getCrisisEligibleCivIds(state: GameState): string[]; // sorted, non-eliminated, has ≥1 city
```

- [ ] **Step 1: Failing tests**

```ts
describe('world-pressure eligibility', () => {
  const base = (aiPressure?: string) => ({
    settings: aiPressure ? { aiPressure } : {},
    civilizations: {
      h1: { id: 'h1', isHuman: true, isEliminated: false, cities: ['c1'] },
      'ai-1': { id: 'ai-1', isHuman: false, isEliminated: false, cities: ['c2'] },
    },
  } as any);
  it('flags off: humans only (parity with today)', () => {
    expect(getCrisisEligibleCivIds(base())).toEqual(['h1']);
    expect(isPiratePressureEligible(base(), 'ai-1')).toBe(false);
  });
  it('pirates flag: pirate pressure includes AI, crisis does not', () => {
    expect(isPiratePressureEligible(base('pirates'), 'ai-1')).toBe(true);
    expect(isCrisisPressureEligible(base('pirates'), 'ai-1')).toBe(false);
  });
  it('full flag: both include AI', () => {
    expect(getCrisisEligibleCivIds(base('full'))).toEqual(['ai-1', 'h1']);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the module; then in `crisis-system.ts` replace the human filter with `getCrisisEligibleCivIds(state)` (keep `.sort()` determinism); in `threat-pressure-system.ts` replace each `civ.isHuman` gate with the pirate helper (lines 81/173/233/257/355/803 — check each: gates guarding *human-only UI/audio warnings* at :233 keep `isHuman`, gates guarding *pressure computation* switch; read the surrounding function to classify, and note the classification in the PR body).
- [ ] **Step 4: FULL suite** — all pre-existing crisis/threat tests pass unchanged (flags default off ⇒ identical behavior). **Step 5: Commit, open PR** titled `feat(pressure): MR1 — actor-agnostic pipeline behind dark flags (#526)`.

---

## MR 2 — Pirates vs AI + navy dispatch

### Task 2.1: Competence knobs on OpponentChallengeProfile

**Files:**
- Modify: `src/core/opponent-challenge.ts` (interface + all three profiles)
- Test: `tests/core/opponent-challenge.test.ts` (append)

Add to `OpponentChallengeProfile`:
```ts
  crisisResponseDelayTurns: number;   // crisis age before the AI acts
  crisisRemedyGoldMultiplier: number; // treasury needed as multiple of remedy cost
  crisisDispatchWeight: number;       // multiplier on dispatch objective score
```
Values — explorer: `4 / 3.0 / 0.5`; standard: `2 / 2.0 / 1.0`; veteran: `0 / 1.2 / 1.5`.

- [ ] Test asserting the three values per profile → FAIL → implement → PASS → commit.

### Task 2.2: AI pirate spawn eligibility (flag `'pirates'`)

**Files:**
- Modify: `src/systems/threat-pressure-system.ts` (spawn scheduling paths now pass AI civs when `isPiratePressureEligible`)
- Test: `tests/systems/threat-pressure-system.test.ts` (append)

- [ ] **Step 1: Failing test** — build a state (reuse this file's existing fixtures) with one AI civ owning a coastal city on a tagged landmass, `settings.aiPressure = 'pirates'`; run the spawn-phase entry (`processThreatPressure(state, 'ai-1', bus)`); assert a pirate fleet targeting the AI city exists in `state.pirateFleets`. Negative twin: same state with flags absent ⇒ no fleet.
- [ ] **Steps 2-4:** FAIL → implement. Two known change sites: (a) `processIndependentThreatPressure`'s civ loop (`threat-pressure-system.ts:251-260`) iterates `isPiratePressureEligible` civs instead of humans; (b) inside `processThreatPressure` / `computeThreatScore`, any remaining human-specific reads (e.g. per-human warning bookkeeping in the `pressureByCiv` ledger) must tolerate AI civ ids — the ledger is already keyed by civId after Task 1.4. Warning/audio emission paths (`lastWarningTurnByKey`, `lastStrategicAudioTurn`) stay HUMAN-ONLY: guard them with `civ.isHuman` explicitly — AI civs don't get UI warnings.
- [ ] **Step 5:** Confirm existing pirate siege/plunder tests still pass (mechanics are owner-generic; only scheduling changed). Commit.

### Task 2.3: `ai-crisis-response.ts` — dispatch candidates (pirate fleets)

**Files:**
- Create: `src/ai/ai-crisis-response.ts`
- Modify: `src/ai/ai-prepared-turn.ts` (merge dispatch candidates into the portfolio context's candidate list — find the `AIPlanCandidate[]` assembly via `grep -n "AIPlanCandidate" src/ai/ai-prepared-turn.ts src/ai/ai-plan-portfolio.ts`)
- Test: `tests/ai/ai-crisis-response.test.ts`

**Interfaces (Produces):**
```ts
export interface CrisisDispatchCandidate {
  kind: 'pirate-fleet' | 'hunt-foe';
  sourceId: string;        // fleetId or crisisId — used for expiry checks
  targetUnitId: string;    // the pirate ship / hunt foe unit
  score: number;           // base score × profile.crisisDispatchWeight
}
export function getCrisisDispatchCandidates(state: GameState, civId: string): CrisisDispatchCandidate[];
```

- [ ] **Step 1: Failing tests** — (a) AI civ with a pirate fleet sieging its coastal city ⇒ one candidate with `kind: 'pirate-fleet'`, `targetUnitId` = the fleet's `unitId`, score scaled by `crisisDispatchWeight` (assert veteran > explorer for same state); (b) fleet's unit dead or fleet absent ⇒ zero candidates (expiry); (c) fleet targeting a DIFFERENT civ ⇒ zero candidates.
- [ ] **Step 3: Implement** — pure function over `state.pirateFleets` filtered to `fleet.targetCivId === civId && state.units[fleet.unitId]`. Base score 100 (comparable to existing defend-city candidates — verify magnitude against `ai-objective-scoring.ts` and note the comparison in a comment).
- [ ] **Step 4-5:** PASS; wire the merge in `ai-prepared-turn.ts` (append candidates before `refreshMajorCivPortfolio` is called), guarded by `isPiratePressureEligible(state, civId)`; add one integration assertion in `tests/ai/ai-prepared-turn.test.ts` that a sieged AI's portfolio contains a plan targeting the pirate unit. Commit; PR `feat(pressure): MR2 — pirate fleets pressure AI civs + navy dispatch (#526)`. Flip default `aiPressure` resolver fallback to `'pirates'` in this MR's final commit (update Task 1.1's two default-assert tests accordingly). **Intended consequence, note in PR body:** flipping the resolver default turns AI-targeted pirates on for existing saves too (their settings lack the field) — that is the rollout mechanism, and it strictly softens the human's relative position.

---

## MR 3 — Crises vs AI: scheduling, response policy, world cap, fairness

### Task 3.1: AI crisis scheduling + world cap

**Files:**
- Modify: `src/systems/crisis-system.ts` (`processCrisisScheduler` + `maybeStartCrisis`)
- Test: `tests/systems/crisis-system.test.ts` (append)

Rules to implement (spec §Architecture seam 2):
- AI civs use `OPPONENT_CHALLENGE_PROFILES.standard` for grace/cooldown/pressure-floor knobs (humans keep `getChallengeProfileForCiv`). In `maybeStartCrisis`, resolve the profile as: `civ.isHuman ? getChallengeProfileForCiv(state, civId) : OPPONENT_CHALLENGE_PROFILES.standard`.
- `maxIndependentCrisesPerHuman` continues to cap humans per-human. AI civs are instead capped globally: `const AI_CRISIS_WORLD_CAP = { small: 2, medium: 3, large: 4 } as const;` — count `Object.values(state.activeCrises ?? {}).filter(c => !state.civilizations[c.targetCivId]?.isHuman)` and skip AI civs when at cap.
- Keep the eligible-civ iteration order sorted for determinism.

- [ ] **Step 1: Failing tests** — (a) with `aiPressure: 'full'` and AI preconditions met, an AI civ receives an `ActiveCrisis`; (b) at cap (seed `activeCrises` with N AI crises for the map size), no new AI crisis starts but a human still can; (c) with `aiPressure: 'pirates'`, no AI crisis starts.
- [ ] **Steps 2-5:** FAIL → implement → full suite → commit.

### Task 3.2: Response policy — quarantine + remedy

**Files:**
- Modify: `src/ai/ai-crisis-response.ts`
- Modify: `src/core/turn-manager.ts:134` (the `processCrisisTurn` call is at line 134, near the top of `processTurn`; insert `newState = applyCrisisResponses(newState);` immediately after it — AI civ turns run later via the AI round scheduler, so responses recorded here shape the same round's plans)
- Test: `tests/ai/ai-crisis-response.test.ts` (append)

**Interfaces (Produces):**
```ts
export type CrisisResponseAction =
  | { kind: 'quarantine'; crisisId: string; cityId: string }
  | { kind: 'fund-remedy'; crisisId: string; cityId: string };
export function getCrisisResponseActions(state: GameState, civId: string): CrisisResponseAction[];
export function applyCrisisResponses(state: GameState): GameState; // loops AI civs, applies via applyQuarantine/applyRemedy
```

Policy (deterministic, spec §AI response competence — profile from `OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)]`):
- Quarantine an infected, un-quarantined city when `crisis age ≥ crisisResponseDelayTurns` OR `crisis.cityIds.length ≥ 2 + (challenge === 'veteran' ? 0 : 1)`. Crisis age = `state.turn - crisis.startedTurn`. One quarantine per crisis per turn, lowest-population infected city first (sorted, deterministic).
- Fund remedy for the most-populous infected city without a pending remedy when `civ.gold ≥ getCityAppeaseCost(city) × crisisRemedyGoldMultiplier`. One per civ per turn.
- Humans are never processed (`civ.isHuman` skip) — their crisis choices are theirs.

- [ ] **Step 1: Failing tests** — per challenge level: exact turn the first quarantine appears (explorer: crisis age 4; veteran: age 0), remedy funded iff treasury threshold met (assert gold actually deducted via `applyRemedy`'s existing behavior), humans untouched, determinism (two runs on structuredClone'd state produce identical actions).
- [ ] **Steps 2-5:** implement → wire `newState = applyCrisisResponses(newState)` in turn-manager (guarded by `resolveWorldPressureFlags(newState.settings).aiPressure === 'full'`) → full suite → commit.

### Task 3.3: Fairness smoke test (the 50–120% band)

**Files:**
- Create: `tests/systems/world-pressure-fairness.test.ts`

- [ ] **Step 1: Write the test** (this is a new permanent regression, not scaffolding):

```ts
// Pattern from tests/core/turn-manager-crisis.test.ts: createNewGame + processTurn loop.
// Counts crisis:started events per civ over 150 turns at standard/full flags.
import { describe, it, expect } from 'vitest';
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';

it('AI civs experience crises within 50-120% of the human rate over 150 turns', () => {
  let state = createNewGame(undefined, 'fairness-seed-1', 'small');
  state = { ...state, settings: { ...state.settings, aiPressure: 'full' } };
  const counts: Record<string, number> = {};
  const bus = new EventBus();
  bus.on('crisis:started', ({ civId }) => { counts[civId] = (counts[civId] ?? 0) + 1; });
  for (let i = 0; i < 150; i++) state = processTurn(state, bus);
  const humanId = state.currentPlayer;
  const humanCount = counts[humanId] ?? 0;
  const aiCivs = Object.values(state.civilizations).filter(c => !c.isHuman && !c.isEliminated);
  expect(humanCount).toBeGreaterThan(0); // the run must actually produce pressure
  for (const ai of aiCivs) {
    const aiCount = counts[ai.id] ?? 0;
    expect(aiCount).toBeGreaterThanOrEqual(Math.floor(humanCount * 0.5));
    expect(aiCount).toBeLessThanOrEqual(Math.ceil(humanCount * 1.2));
  }
}, 120_000); // 150 full turns is slow; generous timeout, still one test
```

- [ ] **Step 2: Run.** If the band fails, this is a TUNING task, not a test-editing task: adjust `AI_CRISIS_WORLD_CAP` and/or AI scheduling knobs until the band holds across seeds `fairness-seed-1..3` (parameterize with `it.each`). Only widen the band with a written justification in the PR body.
- [ ] **Step 3: Commit; PR** `feat(pressure): MR3 — AI civs experience crises (#526)`. Flip `aiPressure` default to `'full'` in the final commit (update flag-default tests).

---

## MR 4 — AI catastrophe restoration

**Files:**
- Modify: `src/ai/ai-crisis-response.ts` (new action kind)
- Modify: `src/ai/ai-prepared-turn.ts` (worker tasking — locate the existing worker-assignment block via `grep -n "workerTask" src/ai/ai-prepared-turn.ts` and the role assignment in `src/ai/ai-unit-assignment.ts`)
- Test: `tests/ai/ai-crisis-response.test.ts` (append)

**Interfaces (Produces):** add to the union — `{ kind: 'restore'; crisisId: string; tileKey: string; workerUnitId: string }`.

Policy: for each of the civ's catastrophe crises in `recovery` stage with `age ≥ crisisResponseDelayTurns`, pair idle owned workers (no `workerTask`, not committed) with the nearest tile in `crisis.tileKeys` where `canRestoreLand(tile, civId, { currentTurn: state.turn })` — assignment applies the same `workerTask` shape the human `restore_land` flow sets (read `worker-action-system.ts:200-250` for the exact fields; reuse its helper if one is exported, otherwise extract one — do not duplicate the mutation inline).

- [ ] **Step 1: Failing tests** — (a) veteran: idle AI worker adjacent to a devastated owned tile gets a `restore` action on the first recovery turn; (b) explorer: no action until crisis age 4; (c) the end-to-end payoff: run enough turns for restoration to complete inside `CATASTROPHE_RECOVERY_WINDOW_TURNS` and assert the AI civ's city gained `resilienceBonusUntilTurn` (veteran) vs. missed it (explorer) — both asserted, the delay knob must have teeth.
- [ ] **Steps 2-5:** implement → full suite → commit → PR `feat(pressure): MR4 — AI workers restore catastrophe devastation (#526)`.

---

## MR 5 — Visibility layer

### Task 5.1: Viewer-safe presentation helper

**Files:**
- Create: `src/systems/world-pressure-presentation.ts`
- Test: `tests/systems/world-pressure-presentation.test.ts`

**Interfaces (Produces):**
```ts
export interface WorldPressureCityBadge { cityId: string; coord: HexCoord; archetype: CrisisArchetype }
export interface WorldPressureStatusLine { civId: string; text: string } // "Suffering: Red Tide outbreak — 3 cities, 4 turns"
export interface WorldPressurePresentation {
  cityBadges: WorldPressureCityBadge[];      // known civs' crisis cities on VISIBLE tiles only
  statusLinesByCivId: Record<string, WorldPressureStatusLine>; // known civs only
}
export function getWorldPressurePresentationForViewer(state: GameState, viewerCivId: string): WorldPressurePresentation;
```

- [ ] **Step 1: Failing tests** — the spec's three negatives plus positives:
  (a) viewer has NOT met the target civ ⇒ no status line, no badges, even with full visibility of the tile;
  (b) met civ, crisis city tile NOT visible to viewer (`getVisibility` from `fog-of-war.ts`) ⇒ status line yes, badge no;
  (c) met civ + visible tile ⇒ badge with correct archetype;
  (d) hot-seat: viewer B with different `knownCivilizations` gets an independent result;
  (e) `aiPressureVisibility: false` ⇒ empty result regardless.
- [ ] **Steps 2-5:** implement (gate on `resolveWorldPressureFlags`; met = `viewer.knownCivilizations.includes(targetCivId)`; humans' own crises excluded — their existing UI covers them) → PASS → commit.

### Task 5.2: Notifications (batched, start/resolve only)

**Files:**
- Modify: `src/ui/notification-routing.ts` (two new routers, following `routeFactionTransition`'s shape)
- Modify: `src/main.ts` (subscribe the routers to `crisis:started` / `crisis:resolved` — grep the existing `crisis:` subscriptions and extend beside them)
- Test: `tests/ui/notification-routing.test.ts` (append)

Rules: route only when the crisis's `targetCivId` is an AI civ (human crises already notify their owner), only to viewers who know that civ, message register per spec tone ("Plague reported in Carthage" / "Carthage has contained its plague"). No routing for spread/siege ticks — assert a spread event produces zero notifications (anti-spam negative).

- [ ] TDD cycle as above; commit.

### Task 5.3: Map badge + diplomacy status line

**Files:**
- Modify: `src/renderer/city-render-passes.ts` (badge draw for `presentation.cityBadges` — reuse the human crisis badge glyph; find it via `grep -rn "crisis" src/renderer/city-render-passes.ts src/renderer/city-renderer.ts`)
- Modify: `src/renderer/render-loop.ts` (compute presentation in `setGameState` — NOT per frame; it scans cities/crises and the result only changes when state changes; cache it on the render-loop instance and pass down)
- Modify: `src/ui/diplomacy-panel.ts` (status line under each known civ, from `statusLinesByCivId`; `textContent` only)
- Test: `tests/ui/diplomacy-panel.test.ts` (append: line renders for known crisis civ; absent for unknown/no-crisis; re-renders after state change per panel-rerender rule)

- [ ] TDD cycle; commit; PR `feat(pressure): MR5 — AI crises visible: notifications, badges, diplomacy status (#526)`. Flip `aiPressureVisibility` default to `true` in the final commit.

---

## MR 6 — Benign interactions: hunt-their-foe + send aid

### Task 6.1: Interaction definition table + resolver

**Files:**
- Create: `src/systems/crisis-interaction-system.ts`
- Test: `tests/systems/crisis-interaction-system.test.ts`

**Interfaces (Produces):**
```ts
export interface CrisisInteractionDefinition {
  id: 'hunt_their_foe' | 'send_aid' | 'exploit_weakness' | 'sabotage_relief';
  techRequired: string | null;           // null = always available once visibility ships
  kind: 'overt' | 'covert';
  targetReputationDelta: number;         // applied actor<->target bilaterally
  witnessReputationDelta: number;        // applied actor<->each witness bilaterally
  oncePerCrisisPerActor: boolean;
}
export const CRISIS_INTERACTION_DEFINITIONS: CrisisInteractionDefinition[]; // data table — new hooks are rows, not branches
export function getWitnessCivIds(state: GameState, actorId: string, targetId: string): string[]; // met BOTH actor and target; excludes actor/target
export function applyInteractionReputation(state: GameState, actorId: string, targetId: string, def: CrisisInteractionDefinition): GameState; // bilateral modifyRelationship for target + witnesses
```

Initial rows (MR 6 ships the first two; MR 7 appends the rest):
```ts
{ id: 'hunt_their_foe', techRequired: null,          kind: 'overt', targetReputationDelta: +15, witnessReputationDelta: +4, oncePerCrisisPerActor: true },
{ id: 'send_aid',       techRequired: 'medicine',    kind: 'overt', targetReputationDelta: +15, witnessReputationDelta: +4, oncePerCrisisPerActor: true },
```
(Delta magnitudes are the plan's starting values — tune in MR 8 against existing diplomacy scales; `recordMilitaryAttack` uses −20-order deltas, so ±15/±4 sit plausibly below war-grade events.)

- [ ] **Step 1: Failing tests** — witness set excludes actor/target and requires mutual contact (three-civ fixture); `applyInteractionReputation` moves BOTH sides of every pair (bilateral assertion); deltas clamp via `modifyRelationship`.
- [ ] **Steps 2-5:** implement → commit.

### Task 6.2: Hunt-their-foe reward wiring

**Files:**
- Modify: `src/systems/crisis-system.ts` (`tickHuntCrisis` — the `killerCivId` resolution block at `:519-534` already knows the killer; when killer ≠ target civ AND killer is a major civ, apply `hunt_their_foe` reputation + emit `crisis:foe-hunted-by-ally` event with `{ crisisId, killerCivId, targetCivId, foeName }`)
- Modify: `src/core/types.ts` (GameEvents entry for the new event)
- Modify: `src/ui/notification-routing.ts` (route it: "Rome slew the beast menacing Carthage!" to viewers knowing either civ)
- Test: `tests/systems/crisis-system.test.ts` (append)

- [ ] **Step 1: Failing tests** — third-civ kill ⇒ both relationship sides move by +15, witnesses by +4, event emitted once; self-kill (target civ kills own foe) ⇒ no reputation, no event; AI killer of an AI target ⇒ same deltas (no humanity special-casing).
- [ ] **Steps 2-5:** implement → commit.

### Task 6.3: Send aid — action + UI

**Files:**
- Modify: `src/systems/crisis-interaction-system.ts` (add `applySendAid`)
- Modify: `src/core/types.ts` (`ActiveCrisis.aidedByCivIds?: string[]`; GameEvents `'crisis:aid-sent'`)
- Modify: `src/ui/diplomacy-panel.ts` (Send Aid button on the crisis status line)
- Test: system + panel tests

**Interfaces (Produces):**
```ts
export function canSendAid(state: GameState, actorCivId: string, crisisId: string):
  { ok: true; goldCost: number } | { ok: false; reason: 'no-tech' | 'already-aided' | 'not-enough-gold' | 'unknown-civ' | 'flag-off' | 'no-crisis' };
export function applySendAid(state: GameState, actorCivId: string, crisisId: string, bus: EventBus): GameState;
```

Behavior: outbreak — actor pays `getCityAppeaseCost(most-populous infected city)`. **Do NOT call `applyRemedy`** — it deducts the TARGET civ's gold (`crisis-system.ts:636`). Instead `applySendAid` deducts the ACTOR's gold and writes the same completion record shape directly: `remedyCompletionByCity: { ...(crisis.remedyCompletionByCity ?? {}), [cityId]: state.turn + 2 }` (mirror `applyRemedy`'s record exactly so the tick's remedy-completion block works unchanged). Catastrophe — actor pays the same formula against the target city; the target civ receives that gold as relief (add to its treasury). Tech gates per definition row: `medicine` (outbreak) / `trade-routes` (catastrophe) — encode as a second row or a per-archetype techRequired map `{ outbreak: 'medicine', catastrophe: 'trade-routes' }` on the `send_aid` row (pick the map; one row per hook stays the invariant). Append actor to `aidedByCivIds`; apply reputation; emit event; button UX per spec: label shows cost + effect + memory line, built with `createGameButton`, disabled state carries the `reason` as help text.

- [ ] **Step 1: Failing tests** — happy path (gold moves from actor only; remedy scheduled; reputation bilateral; event once); each `reason` negative including `already-aided` (once-per-crisis); **human-target test**: human A aids human B's crisis, both relationships move, witnesses notified (hot-seat requirement).
- [ ] **Steps 2-5:** implement → panel test (click-through: button click calls `applySendAid`, panel re-renders) → commit.

### Task 6.4: Tech honesty text

**Files:**
- Modify: `src/systems/tech-definitions-eras1-4.ts` (`medicine`, `trade-routes` — append unlocks strings: `'Send medical aid to a plague-struck civilization you have met'` / `'Send relief gold to a disaster-struck civilization you have met'`)
- Test: the positive tests from 6.3 ARE the honesty proof; add the strings in the same commit (content-description-honesty rule).

- [ ] Implement + full suite + commit; PR `feat(pressure): MR6 — hunt-their-foe and send-aid interactions (#526)`. Flip `aiCrisisInteractions` default to `'benign'`.

---

## MR 7 — Full interactions: exploit weakness + sabotage relief

### Task 7.1: Exploit weakness — intel + opportunistic war

**Files:**
- Modify: `src/systems/crisis-interaction-system.ts` (append the `exploit_weakness` row: `techRequired: 'diplomatic-networks'`, `kind: 'overt'`, deltas `-15 / -8`, `oncePerCrisisPerActor: false`)
- Modify: `src/systems/world-pressure-presentation.ts` (with `diplomatic-networks` completed, status lines include severity + infected-city list — extend `WorldPressureStatusLine` with `detail?: string`)
- Modify: `src/main.ts` war-declaration path + `src/systems/diplomacy-system.ts` `declareWar` (grep both; the shared helper is the mutation point per actor-complete rule): when the declared-upon civ has an active crisis, apply `exploit_weakness` reputation (declarer ↔ target and witnesses) and emit `'diplomacy:opportunistic-war'`
- Test: system tests + one AI-path parity test (AI declaring war on a crisis-struck civ takes the same reputation hit — actor-complete)

- [ ] **Failing tests:** war on crisis-struck civ ⇒ deltas + event; war on healthy civ ⇒ no extra deltas; intel detail present only with the tech; AI-declarer parity.
- [ ] Implement → commit. **Accepted design note:** AI civs also eat the opportunistic-war penalty when they happen to declare on a crisis-struck civ — symmetric fairness, no special-casing. Teaching AI war-scoring to *avoid* opportunistic timing is explicitly out of scope (would be an AI-initiated-interaction feature).

### Task 7.2: Sabotage relief — spy mission

**Files:**
- Modify: `src/core/types.ts` (`SpyMissionType` + `'sabotage_relief'`; `ActiveCrisis.sabotage?: { byCivId: string; untilTurn: number; discovered: boolean }`; GameEvents `'espionage:sabotage-relief-discovered'`)
- Modify: `src/systems/espionage-system.ts` (add to the stage list gated by `covert-operations` — read the stage arrays at `:353` and the tech mapping near `:441`; add a `case 'sabotage_relief'` to the resolution dispatch at `:749` following the adjacent cases' shape)
- Modify: `src/systems/crisis-system.ts` (`tickOutbreakCrisis`: while `sabotage.untilTurn > state.turn`, remedy completions are paused — skip the remedy-completion block for affected cities; spread continues)
- Modify: `src/ui/espionage-panel.ts` (mission appears in the existing mission list — it inherits the panel's catalog rendering; verify, don't rebuild)
- Test: espionage + crisis system tests

Mechanics: mission success sets `crisis.sabotage = { byCivId, untilTurn: state.turn + 4, discovered: false }` (4 turns — MR 8 tunes). One active sabotage per crisis (`ok: false, reason: 'already-sabotaged'`). Detection uses the mission's existing detection roll (same as `sabotage_production`'s — copy its detection parameters); on detection set `discovered: true` and apply `sabotage_relief` reputation (deltas `-25 / -8`) + emit the discovery event; notification: "{Actor}'s spies were caught sabotaging {Target}'s relief!" to all witnesses (hot-seat drama requirement — human witnesses see it).

- [ ] **Failing tests:** remedy paused during sabotage window then resumes; one-active-per-crisis negative; undiscovered ⇒ zero reputation change; discovered ⇒ bilateral deltas to target AND witnesses + notification routed; family-tone string asserted verbatim.
- [ ] Implement → commit.

### Task 7.3: Tech honesty text (era 5-7)

- Modify `src/systems/tech-definitions-eras5-7.ts`: `diplomatic-networks` += `'Reveal detailed crisis intelligence on civilizations you have met'`; `covert-operations` += `'Spy mission: sabotage a rival's crisis relief'`. Same-commit rule; positive tests from 7.1/7.2 are the proof.
- [ ] Full suite → commit → PR `feat(pressure): MR7 — exploit weakness + sabotage relief (#526)`. Flip `aiCrisisInteractions` default to `'full'`.

---

## MR 8 — Balance pass

**Files:**
- Modify: tuning constants only (`AI_CRISIS_WORLD_CAP`, competence knobs, reputation deltas, sabotage duration)
- Test: existing suites are the harness

- [ ] Run the fairness suite across seeds `fairness-seed-1..3` (`it.each`); tune until the 50–120% band holds on all three. Runtime note: 3 × 150 full turns is the suite's slowest test — keep the per-case timeout at 120 000 ms and mark the describe `sequential`; if wall time exceeds ~5 min, drop to 100 turns and re-derive the band before weakening it.
- [ ] Run `tests/systems/pacing-audit.test.ts` + `tests/systems/pacing-reference-economy.test.ts`; if reference-economy snapshots shift, include updated numbers + one-line justification in the PR (game-balance rule).
- [ ] Play-check hot seat (2 humans, small map, 60 turns via `yarn dev`) for notification volume; if the log exceeds ~3 world-pressure entries per turn, batch or coalesce further.
- [ ] Update `docs/superpowers/specs/2026-07-11-world-pressure-symmetry-design.md` "Open items" with the final tuned values.
- [ ] PR `feat(pressure): MR8 — fairness + pacing balance pass (#526)`. Optional handoff note to the audio arc for bespoke stingers.

---

## Self-review checklist (run before finalizing any MR's PR)

1. Spec section implemented by this MR is fully covered (re-read it).
2. No new `resolveChallengeForCiv` call in a severity context (grep).
3. No `Math.random`, no state mutation in place, bilateral diplomacy everywhere (grep `modifyRelationship` call sites — must come in pairs or via `applyInteractionReputation`).
4. Flags: every new behavior is unreachable at the previous stage's defaults.
5. `yarn build` && `yarn test` green before push.
