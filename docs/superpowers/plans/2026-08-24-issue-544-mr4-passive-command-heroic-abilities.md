# #544 MR4 — Passive Command + Heroic Abilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. **Do not use subagent-driven-development or
> any other subagent-dispatching approach for this repo** — this project's
> `CLAUDE.md` explicitly forbids subagents/parallel agents; execute every task
> inline in the current session. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Give every spawned Great General (MR3) its promised gameplay:
passive command stabilization, the 3-lifetime-charge heroic command resource
model, Rally, Seize the Moment, Last Stand (including the
`applyCombatOutcomeToState` Hold-save integration), and Final Command /
retirement — per contract §16-22, §24, §27, §28.

**Architecture:** Extends `GeneralDefinition` (great-general-definitions.ts)
additively with `abilityIds`/`maxCommandCharges`/`cooldownTurns` — the exact
seam MR3 deliberately left open. All new per-unit runtime state (charges
used, cooldown, Rally's this-round protection, Last Stand's Hold state) is
optional `Unit` fields, legacy-save-safe by construction, using the
"undefined = default" convention already established by `chargesRemaining`/
`missionaryCooldownUntilTurn`. Passive stabilization extends
`advanceOverextensionStage`'s pre-existing `stabilizedByGeneral` seam
(`supply-progression.ts`). The three heroic abilities live in one new
`src/systems/great-general-abilities.ts` module; lifecycle/retirement stays
in the existing `great-general-system.ts`. Last Stand's defense bonus flows
through the existing `CombatContext` multiplier pipeline (mirroring
`resolveLandSupplyCombatPenalty`'s `{ multiplier, label }` shape exactly);
its Hold-save mirrors the existing `geneTherapyReady` branch shape in
`applyCombatOutcomeToState`, extended to the pre-existing splash-hit loop so
"protects against bombardment" (contract §27) is actually true. No new RNG
is needed anywhere in this MR — every rule (stabilization priority, Rally
targeting, Last Stand area) is a deterministic sort, not a random draw.

**Tech Stack:** TypeScript, Vitest, vanilla DOM (no new dependencies).

## Global Constraints

- **No `Math.random()` — and no RNG at all.** Unlike MR3 (candidate
  generation), nothing in MR4 needs randomness: passive-stabilization
  priority, Rally's auto-targeting priority, and Last Stand's affected-unit
  selection are all deterministic sorts (distance, then missing-HP/stage
  score, then a stable unit-id tie-break). If a future task in this plan
  seems to need `Math.random()`, that's a signal the design has drifted from
  the contract — stop and re-read contract §16/§18/§20.
- **Difficulty-invariant.** No function in this plan reads or branches on
  `GameState.opponentChallenge` / `Civilization.challenge`. Same charges,
  same cooldown, same eligibility, same priority ordering, for every
  difficulty. Regression required (Task 15), extending MR3's
  `tests/systems/great-general-mr3-invariants.test.ts` precedent.
- **Hot-seat privacy.** Every ability-issuing function takes an explicit
  `civId`/general `owner` and only ever reads/writes that civ's own units and
  `generalHistory`. UI ability buttons and preview panels must only render
  for `state.currentPlayer`'s own Generals — never surface enemy command
  charges, cooldowns, or targeting to the non-active hot-seat player.
  Regression required (Task 15).
- **All new state is optional, legacy-save-safe, zero migration writes:**
  `Unit.generalCommandChargesUsed?`, `Unit.generalCommandCooldownUntilTurn?`,
  `Unit.rallyProtectedThisRound?`, `Unit.lastStandHold?`,
  `Unit.hasCapturedCityThisTurn?`, `GeneralDefinition.abilityIds`/
  `maxCommandCharges`/`cooldownTurns` (definitions are static catalog data,
  not save data), `GeneralHistoryEntry.outcome?`/`retiredTurn?`/
  `endOfCareerLine?`/`heroicCommandsUsed?`. `generalCommandChargesUsed`
  absent means **0 used** (full charges) and `generalCommandCooldownUntilTurn`
  absent means **no active cooldown** — both read correctly on a legacy save
  with no migration entry needed, exactly like `chargesRemaining`/
  `missionaryCooldownUntilTurn` already do. **This means `spawnGeneralForCiv`
  needs no code change for charge/cooldown initialization** — the handoff
  doc guessed it would, but the optional-field-defaults-to-full convention
  already used everywhere else in this codebase makes an explicit init
  redundant. Task 1 verifies this with a spawn test instead of adding dead
  initialization code.
- **Movement Bonus Stacking Policy check (`.claude/rules/game-balance.md`):
  MR4 grants no movement bonus.** Seize the Moment deliberately does **not**
  restore `movementPointsLeft` (contract §19: "no full movement refresh") —
  it only resets `hasActed`/`hasMoved` so a unit with movement points already
  left over can reposition, and unlocks exactly one more attack. No new row
  is needed in the stacking inventory table. Task 15 adds an explicit
  regression proving this.
- **Last Stand's Hold save must be reachable from every lethal path inside
  `applyCombatOutcomeToState`, not just melee** (contract §27). The existing
  `geneTherapyReady` precedent only guards the direct attacker/defender
  branches — the pre-existing splash-hit loop bypasses it entirely today.
  Task 8 extends the *same* choke point to splash so "protects against
  bombardment" is true, without touching `geneTherapyReady`'s existing
  (narrower) behavior — that gap is real but out of scope for this MR, noted
  inline rather than silently fixed, per `.claude/rules/spec-fidelity.md`.
- Reuse existing helpers, never re-derive: `getEffectiveCommandStats`
  (`great-general-system.ts`, MR3 — supply-degraded command range/capacity);
  `mapDistance`/`mapHexesInRange` (`hex-utils.ts`, map-wrap-aware, matching
  `supply-sources.ts`'s convention); `resolveFortificationDefense`/
  `resolveLandSupplyCombatPenalty`'s `{ multiplier, label? }` shape
  (`fortification-system.ts`/`supply-combat.ts`); `createGameButton`
  (`ui-kit.ts`); the `ADVISOR_MESSAGES`/`tutorialStep` pattern
  (`advisor-system.ts`) that MR2's `supply_intro` entry already established;
  `UNIT_CLASS_BY_TYPE` (`unit-modifier-definitions.ts`) for the
  civilian/combat-unit distinction Last Stand needs.
- Full repo test command: `bash scripts/run-with-mise.sh yarn test`. Full
  build/typecheck: `bash scripts/run-with-mise.sh yarn build`. Both run
  before the final commit (Task 16).

---

## File Structure

- **Modify** `src/core/types.ts` — new `HeroicAbilityId` type; `Unit` gains
  `generalCommandChargesUsed?: number`, `generalCommandCooldownUntilTurn?: number`,
  `rallyProtectedThisRound?: boolean`, `lastStandHold?: LastStandHoldState`,
  `hasCapturedCityThisTurn?: boolean`; new `LastStandHoldState` interface;
  `GeneralHistoryEntry` gains `outcome?: 'retired' | 'died'`,
  `retiredTurn?: number`, `endOfCareerLine?: string`,
  `heroicCommandsUsed?: number`. Task 1.
- **Modify** `src/systems/great-general-definitions.ts` — `GeneralDefinition`
  gains `abilityIds: HeroicAbilityId[]`, `maxCommandCharges: number`,
  `cooldownTurns: number`; V1 constants; applied uniformly across the
  existing roster. Task 1.
- **Modify** `src/systems/unit-system.ts` — `resetUnitTurn` clears
  `generalNoCommandThisTurn` and `rallyProtectedThisRound` at the unit
  owner's next turn. Task 2.
- **Create** `src/systems/great-general-abilities.ts` — shared heroic-command
  eligibility/spend (`getHeroicCommandEligibility`, `spendHeroicCommandCharge`);
  Rally (`getRallyPreview`, `issueRally`); Seize the Moment
  (`getSeizeTheMomentPreview`, `issueSeizeTheMoment`); Last Stand
  (`getLastStandPreview`, `issueLastStand`, `resolveLastStandDefenseBonus`,
  `consumeLastStandHoldFormationWide`). Tasks 3, 5, 6, 7.
- **Modify** `src/systems/great-general-system.ts` — `getPassiveStabilizationTargets`;
  `retireGeneralsAtTurnEnd`; `describeGeneralCareerEnd`. Tasks 4, 9.
- **Modify** `src/systems/supply-progression.ts` — `advanceOverextensionStage`
  gains the pre-documented `stabilizedByGeneral: boolean = false` parameter.
  Task 4.
- **Modify** `src/systems/supply-system.ts` — `resolveLandSupplyForCiv`
  computes passive-stabilization targets once per civ per round and passes
  the combined (General-stabilized OR Rally-protected) boolean through. Task 4.
- **Modify** `src/systems/city-capture-system.ts` — `hasCapturedCityThisTurn`
  guard preventing multi-capture in one turn (contract §19), on
  `beginMajorCityAssault`, the single real per-unit city-occupation entry
  point every real caller (player, AI) routes through. Task 6.
- **Modify** `src/systems/combat-context.ts` — `buildCombatContextForDefender`
  wires `resolveLastStandDefenseBonus` the same way it already wires
  `resolveLandSupplyCombatPenalty`. Task 7.
- **Modify** `src/systems/combat-system.ts` — `CombatContext` gains
  `defenderLastStandMultiplier?`/`defenderLastStandFact?`;
  `calculateCombatStrengths` applies the multiplier. Task 7.
- **Modify** `src/systems/combat-reward-system.ts` — Last Stand Hold-save
  branches mirroring `geneTherapyReady`'s shape on the attacker branch, the
  defender branch, and the splash-hit loop; `recordGeneralDeaths` extended
  with `outcome`/`endOfCareerLine`/`heroicCommandsUsed`. Task 8, 9.
- **Modify** `src/core/turn-manager.ts` — per-civ end-of-round loop calls
  `retireGeneralsAtTurnEnd` before `resetUnitTurn`. Task 9.
- **Modify** `src/core/types.ts` (`EventBus` gains `'general:retired'`) and
  **modify** `src/presentation/register-general-presentation.ts` (delivers
  the retirement notification to the owning civ). Task 9.
- **Modify** `src/ui/selected-unit-info.ts` — General command panel: exact
  range/capacity/charges/cooldown display, three ability buttons, Final
  Command warning styling. Task 10.
- **Create** `src/ui/general-command-panel.ts` — Rally auto-preview/confirm;
  Seize eligible-unit picker; Last Stand target/preview/confirm; Final
  Command confirmation. Tasks 11, 12.
- **Modify** `src/app/controllers/selection-controller.ts` (or the sibling
  controller that owns hex-click dispatch — confirmed in Task 12) — wires
  the three ability buttons and Last Stand's hex-targeting mode. Tasks 11, 12.
- **Modify** `src/ui/advisor-system.ts` — first-General tutorial entry
  (`tutorialStep: 'general_command_intro'`) plus one contextual Last-Stand
  hint. `src/core/types.ts` — `TutorialStep` gains `'general_command_intro'`.
  Task 13.
- **Modify** `src/storage/save-migrations.ts` — verify only (Task 14): no
  migration entry needed, all new fields optional.
- **Create** `tests/systems/great-general-abilities.test.ts`. **Modify**
  `tests/systems/great-general-system.test.ts`,
  `tests/systems/great-general-mr3-invariants.test.ts` (or a new MR4-specific
  sibling — decided in Task 15), `tests/systems/unit-system.test.ts`,
  `tests/systems/supply-progression.test.ts`, `tests/systems/supply-system.test.ts`,
  `tests/systems/city-capture-system.test.ts`,
  `tests/systems/combat-system.test.ts` (covers `combat-context.ts` too — see Task 7),
  `tests/systems/combat-reward-system.test.ts`,
  `tests/core/turn-manager.test.ts`, `tests/ui/selected-unit-info.test.ts`,
  `tests/ui/general-command-panel.test.ts` (new), plus the app-controller test
  file(s) touched by Tasks 11-12.

---

### Task 1: `GeneralDefinition` ability/charge fields, `Unit` runtime fields, `GeneralHistoryEntry` outcome fields

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/great-general-definitions.ts`
- Test: `tests/systems/great-general-definitions.test.ts`

**Interfaces:**
- Produces: `HeroicAbilityId = 'rally' | 'seize_the_moment' | 'last_stand'`;
  `LastStandHoldState = { formationId: string; defenseBonusMultiplier: number; expiresTurn: number }`;
  `GeneralDefinition.abilityIds: HeroicAbilityId[]`,
  `GeneralDefinition.maxCommandCharges: number`, `GeneralDefinition.cooldownTurns: number`;
  `Unit.generalCommandChargesUsed?: number`, `Unit.generalCommandCooldownUntilTurn?: number`,
  `Unit.rallyProtectedThisRound?: boolean`, `Unit.lastStandHold?: LastStandHoldState`,
  `Unit.hasCapturedCityThisTurn?: boolean`; `GeneralHistoryEntry.outcome?: 'retired' | 'died'`,
  `GeneralHistoryEntry.retiredTurn?: number`, `GeneralHistoryEntry.endOfCareerLine?: string`,
  `GeneralHistoryEntry.heroicCommandsUsed?: number`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-definitions.test.ts (append to existing file)
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

describe('#544 MR4 — heroic command fields', () => {
  it('every General definition has a positive maxCommandCharges, positive cooldownTurns, and non-empty abilityIds', () => {
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.maxCommandCharges).toBeGreaterThan(0);
      expect(def.cooldownTurns).toBeGreaterThan(0);
      expect(def.abilityIds.length).toBeGreaterThan(0);
    }
  });

  it('every definition includes all three V1 abilities (contract §17: no per-definition ability variance yet)', () => {
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.abilityIds).toEqual(
        expect.arrayContaining(['rally', 'seize_the_moment', 'last_stand']),
      );
    }
  });

  it('V1 charge count is 3 lifetime charges (contract §17)', () => {
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.maxCommandCharges).toBe(3);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-definitions.test.ts`
Expected: FAIL — `def.maxCommandCharges` is `undefined`, `.toBeGreaterThan(0)` fails.

- [ ] **Step 3: Add the new types to `src/core/types.ts`**

In the `// --- Great Generals (#544 MR3) ---` section (around line 195),
extend `GeneralHistoryEntry` and add the new shared types just above it:

```ts
// --- Great Generals (#544 MR3, heroic commands #544 MR4) ---

export type HeroicAbilityId = 'rally' | 'seize_the_moment' | 'last_stand';

/** #544 MR4: Last Stand's shared formation state — one object drives both
 * the ongoing defense multiplier (read every combat while unexpired) and
 * the one-time "Hold!" survival save (consumed formation-wide on first
 * trigger, see consumeLastStandHoldFormationWide). */
export interface LastStandHoldState {
  formationId: string;
  defenseBonusMultiplier: number;
  expiresTurn: number; // inclusive: still active while state.turn <= expiresTurn
}

export interface GeneralProgressState {
  points: number;
  generalsEarned: number; // count of thresholds crossed so far, this game
}

export interface GeneralHistoryEntry {
  unitId: string;
  generalDefinitionId: string;
  spawnedTurn: number;
  diedTurn?: number;
  /** #544 MR4: set once the General's career ends by either path. Absent
   * means still active. */
  outcome?: 'retired' | 'died';
  retiredTurn?: number;
  /** #544 MR4 contract §23: "one concise end-of-career line." */
  endOfCareerLine?: string;
  /** #544 MR4 contract §23: "heroic commands used/counts." Snapshotted from
   * the unit's own generalCommandChargesUsed at the moment its career ends,
   * since the live Unit record is gone after removal. */
  heroicCommandsUsed?: number;
}
```

Then in the `Unit` interface (around line 621, right after
`generalNoCommandThisTurn?`), add:

```ts
  /** #544 MR4: charges spent out of GeneralDefinition.maxCommandCharges.
   * Absent = 0 used (full charges) — legacy-save-safe by construction, same
   * convention as chargesRemaining. */
  generalCommandChargesUsed?: number;
  /** #544 MR4: unit can't issue another heroic command until
   * state.turn >= this. Absent = no active cooldown. Mirrors
   * missionaryCooldownUntilTurn exactly. */
  generalCommandCooldownUntilTurn?: number;
  /** #544 MR4 contract §18: Rally "prevents worsening again until next
   * owner turn." Consumed by advanceOverextensionStage's stabilizedByGeneral
   * input for the remainder of this round, then cleared by resetUnitTurn at
   * this unit's owner's next turn. */
  rallyProtectedThisRound?: boolean;
  /** #544 MR4 contract §20: Last Stand's defense bonus + one-time Hold save
   * for this unit's formation. Absent = not under Last Stand. */
  lastStandHold?: LastStandHoldState;
  /** #544 MR4 contract §19: "a unit may not chain multiple captures in the
   * same turn." Set by beginMajorCityAssault on the capturing unit;
   * cleared by resetUnitTurn. */
  hasCapturedCityThisTurn?: boolean;
```

- [ ] **Step 4: Extend `GeneralDefinition` and the roster in `great-general-definitions.ts`**

```ts
import type { HeroicAbilityId } from '@/core/types';

export interface GeneralDefinition {
  id: string;
  name: string;
  civTypeEligibility: string[];
  era: number;
  descriptor: string;
  portraitIcon: string;
  commandRange: number;
  commandCapacity: number;
  /** #544 MR4. V1 entries share identical values by data coincidence, same
   * caveat as commandRange/commandCapacity above — nothing reads these as
   * literals, only via the definition. */
  abilityIds: HeroicAbilityId[];
  maxCommandCharges: number;
  cooldownTurns: number;
}

const V1_COMMAND_RANGE = 2;
const V1_COMMAND_CAPACITY = 3;
// #544 MR4 contract §17: "3 lifetime Command Charges... initial playtest
// target: ~10 owner turns" shared cooldown.
const V1_MAX_COMMAND_CHARGES = 3;
const V1_COOLDOWN_TURNS = 10;
const V1_ABILITY_IDS: HeroicAbilityId[] = ['rally', 'seize_the_moment', 'last_stand'];
```

Then apply `abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS,`
to every one of the 25 entries in `GENERAL_DEFINITIONS`. Since every entry
already ends with `commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },`,
do this as one `replace_all` on that exact trailing substring:

```ts
// old (all 25 occurrences):
commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
// new:
commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-definitions.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full build to catch any type errors from the new `Unit`/`GeneralHistoryEntry` fields**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS (all new fields optional, no existing call site should break)

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/great-general-definitions.ts tests/systems/great-general-definitions.test.ts
git commit -m "feat(#544): MR4 Task 1 — heroic command fields on GeneralDefinition and Unit"
```

---

### Task 2: Clear `generalNoCommandThisTurn` and `rallyProtectedThisRound` in `resetUnitTurn`

**Files:**
- Modify: `src/systems/unit-system.ts:797-818`
- Test: `tests/systems/unit-system.test.ts`

**Interfaces:**
- Consumes: `Unit.generalNoCommandThisTurn?: boolean` (types.ts, MR3),
  `Unit.rallyProtectedThisRound?: boolean` (Task 1).
- Produces: `resetUnitTurn` now also clears both flags — no signature change.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/unit-system.test.ts (append to existing resetUnitTurn describe block, or a new one)
describe('#544 MR4 — resetUnitTurn clears General per-turn flags', () => {
  it('clears generalNoCommandThisTurn at the owner\'s next turn', () => {
    const unit = { ...baseUnit, type: 'great_general', generalNoCommandThisTurn: true } as Unit;
    const reset = resetUnitTurn(unit);
    expect(reset.generalNoCommandThisTurn).toBeUndefined();
  });

  it('clears rallyProtectedThisRound at the owner\'s next turn', () => {
    const unit = { ...baseUnit, rallyProtectedThisRound: true } as Unit;
    const reset = resetUnitTurn(unit);
    expect(reset.rallyProtectedThisRound).toBeUndefined();
  });

  it('does not disturb lastStandHold, which must persist across turns until it expires or is consumed', () => {
    const hold = { formationId: 'gen1-5', defenseBonusMultiplier: 1.15, expiresTurn: 9 };
    const unit = { ...baseUnit, lastStandHold: hold } as Unit;
    const reset = resetUnitTurn(unit);
    expect(reset.lastStandHold).toEqual(hold);
  });
});
```

(Use whatever minimal `baseUnit` fixture the existing `resetUnitTurn` describe
block in this file already defines — check the top of the file for it before
writing a second one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/unit-system.test.ts`
Expected: FAIL — `reset.generalNoCommandThisTurn` is still `true`.

- [ ] **Step 3: Update `resetUnitTurn`**

```ts
// src/systems/unit-system.ts:797-801 — extend the existing destructure
export function resetUnitTurn(unit: Unit): Unit {
  // revealedThisTurn (#542 reveal-on-fire), generalNoCommandThisTurn (#544
  // MR3: "operational next owner turn"), and rallyProtectedThisRound (#544
  // MR4: "prevent worsening again until next owner turn") must all clear
  // here alongside skippedTurn/interceptedTurn -- this is the one place
  // every other per-owner-turn transient flag already resets.
  const {
    skippedTurn: _skippedTurn,
    interceptedTurn: _interceptedTurn,
    revealedThisTurn: _revealedThisTurn,
    generalNoCommandThisTurn: _generalNoCommandThisTurn,
    rallyProtectedThisRound: _rallyProtectedThisRound,
    ...rest
  } = unit;
  // ...rest of function unchanged
```

The rest of the function body (severe-supply movement penalty, `base`
construction, `workerTask` early return) is untouched — only the destructure
line grows.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/unit-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/unit-system.ts tests/systems/unit-system.test.ts
git commit -m "feat(#544): MR4 Task 2 — clear General per-turn command flags on owner turn reset"
```

---

### Task 3: Shared heroic-command eligibility and charge/cooldown spend

**Files:**
- Create: `src/systems/great-general-abilities.ts`
- Test: `tests/systems/great-general-abilities.test.ts`

**Interfaces:**
- Consumes: `GENERAL_DEFINITIONS` (`great-general-definitions.ts`, Task 1);
  `Unit.generalDefinitionId`/`generalNoCommandThisTurn`/
  `generalCommandChargesUsed`/`generalCommandCooldownUntilTurn` (Task 1).
- Produces: `HeroicCommandEligibility` type; `getHeroicCommandEligibility(state, general): HeroicCommandEligibility`;
  `spendHeroicCommandCharge(state, generalUnitId): GameState`. Every later
  ability task (5, 6, 7) calls both of these — this is the one place charge
  math and cooldown math live.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-abilities.test.ts
import { describe, expect, it } from 'vitest';
import { getHeroicCommandEligibility, spendHeroicCommandCharge } from '@/systems/great-general-abilities';
import { createNewGame } from '@/core/game-state';
import type { Unit } from '@/core/types';

function makeGeneral(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1',
    type: 'great_general',
    owner: 'player',
    position: { q: 0, r: 0 },
    movementPointsLeft: 3,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    generalDefinitionId: 'gen_caesar',
    ...overrides,
  } as Unit;
}

describe('getHeroicCommandEligibility', () => {
  it('is eligible with full charges, no cooldown, and no spawn-turn restriction', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-1' });
    const result = getHeroicCommandEligibility(state, makeGeneral());
    expect(result.eligible).toBe(true);
    expect(result.chargesRemaining).toBe(3);
    expect(result.isFinalCharge).toBe(false);
  });

  it('is ineligible on the General\'s spawn turn (contract §13/§17)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-2' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalNoCommandThisTurn: true }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/next turn/i);
  });

  it('is ineligible with zero charges remaining', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-3' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandChargesUsed: 3 }));
    expect(result.eligible).toBe(false);
    expect(result.chargesRemaining).toBe(0);
  });

  it('is ineligible while on cooldown, and reports turns remaining', () => {
    const state = { ...createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-4' }), turn: 5 };
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandCooldownUntilTurn: 12 }));
    expect(result.eligible).toBe(false);
    expect(result.cooldownTurnsRemaining).toBe(7);
  });

  it('flags the 3rd charge as isFinalCharge (Final Command, contract §21)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-5' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandChargesUsed: 2 }));
    expect(result.eligible).toBe(true);
    expect(result.chargesRemaining).toBe(1);
    expect(result.isFinalCharge).toBe(true);
  });
});

describe('spendHeroicCommandCharge', () => {
  it('increments generalCommandChargesUsed and starts the shared cooldown from the definition', () => {
    const state = { ...createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-6' }), turn: 8 };
    state.units['gen-1'] = makeGeneral();
    const result = spendHeroicCommandCharge(state, 'gen-1');
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
    expect(result.units['gen-1'].generalCommandCooldownUntilTurn).toBe(18); // turn 8 + cooldownTurns 10
  });

  it('is a no-op state pass-through when the unit id does not resolve to a General', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-7' });
    const result = spendHeroicCommandCharge(state, 'nonexistent');
    expect(result).toBe(state);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-abilities.test.ts`
Expected: FAIL — cannot find module `@/systems/great-general-abilities`.

- [ ] **Step 3: Write the implementation**

```ts
// src/systems/great-general-abilities.ts
import type { GameState, Unit } from '@/core/types';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

export interface HeroicCommandEligibility {
  eligible: boolean;
  reason?: string;
  chargesRemaining: number;
  isFinalCharge: boolean;
  cooldownTurnsRemaining: number;
}

/**
 * #544 MR4 contract §17: shared gate every heroic ability (Rally, Seize,
 * Last Stand) checks before doing anything else. One charge/cooldown model
 * for all three -- no independent per-ability cooldowns, no combat-driven
 * recharge, no tech/difficulty acceleration (difficulty-invariant: this
 * function never reads state.opponentChallenge or civ.challenge).
 */
export function getHeroicCommandEligibility(
  state: Pick<GameState, 'turn'>,
  general: Pick<Unit, 'generalDefinitionId' | 'generalNoCommandThisTurn' | 'generalCommandChargesUsed' | 'generalCommandCooldownUntilTurn'>,
): HeroicCommandEligibility {
  const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
  const maxCharges = definition?.maxCommandCharges ?? 0;
  const chargesUsed = general.generalCommandChargesUsed ?? 0;
  const chargesRemaining = Math.max(0, maxCharges - chargesUsed);
  const cooldownUntil = general.generalCommandCooldownUntilTurn ?? 0;
  const cooldownTurnsRemaining = Math.max(0, cooldownUntil - state.turn);

  if (general.generalNoCommandThisTurn) {
    return {
      eligible: false,
      reason: 'This General just took command and cannot act until next turn.',
      chargesRemaining,
      isFinalCharge: false,
      cooldownTurnsRemaining,
    };
  }
  if (chargesRemaining <= 0) {
    return { eligible: false, reason: 'No Command Charges remaining.', chargesRemaining, isFinalCharge: false, cooldownTurnsRemaining };
  }
  if (cooldownTurnsRemaining > 0) {
    return {
      eligible: false,
      reason: `Command is on cooldown for ${cooldownTurnsRemaining} more turn(s).`,
      chargesRemaining,
      isFinalCharge: false,
      cooldownTurnsRemaining,
    };
  }
  return { eligible: true, chargesRemaining, isFinalCharge: chargesRemaining === 1, cooldownTurnsRemaining: 0 };
}

/**
 * Spends one Command Charge and starts the shared cooldown (contract §17:
 * "any ability costs 1 charge and starts the same shared cooldown"). Callers
 * (Rally/Seize/Last Stand issuance in this same file) call this exactly
 * once per successful ability issuance, after applying the ability's own
 * effects -- charge/cooldown state and effect state are independent writes
 * to the same unit, composed by the caller.
 */
export function spendHeroicCommandCharge(state: GameState, generalUnitId: string): GameState {
  const general = state.units[generalUnitId];
  const definition = general ? GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId) : undefined;
  if (!general || !definition) return state;

  return {
    ...state,
    units: {
      ...state.units,
      [generalUnitId]: {
        ...general,
        generalCommandChargesUsed: (general.generalCommandChargesUsed ?? 0) + 1,
        generalCommandCooldownUntilTurn: state.turn + definition.cooldownTurns,
      },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-abilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-abilities.ts tests/systems/great-general-abilities.test.ts
git commit -m "feat(#544): MR4 Task 3 — shared heroic command eligibility and charge/cooldown spend"
```

---

### Task 4: Passive command stabilization

**Files:**
- Modify: `src/systems/great-general-system.ts`
- Modify: `src/systems/supply-progression.ts:25-38`
- Modify: `src/systems/supply-system.ts`
- Test: `tests/systems/great-general-system.test.ts`, `tests/systems/supply-progression.test.ts`, `tests/systems/supply-system.test.ts`

**Interfaces:**
- Consumes: `getEffectiveCommandStats` (`great-general-system.ts`, MR3);
  `mapDistance` (`hex-utils.ts`); `GENERAL_DEFINITIONS` (Task 1).
- Produces: `getPassiveStabilizationTargets(state, civId): Set<string>`
  (`great-general-system.ts`) — unit ids currently protected from
  degradation this round. `advanceOverextensionStage` gains a 4th parameter
  `stabilizedByGeneral: boolean = false`.

- [ ] **Step 1: Write the failing test for `getPassiveStabilizationTargets`**

```ts
// tests/systems/great-general-system.test.ts (append)
import { getPassiveStabilizationTargets } from '@/systems/great-general-system';

describe('#544 MR4 — getPassiveStabilizationTargets', () => {
  function baseState() {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'stab-1' });
    return state;
  }

  it('stabilizes an eligible out-of-supply unit within commandRange of an operational General', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar',
    } as Unit;
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    const targets = getPassiveStabilizationTargets(state, 'player');
    expect(targets.has('unit-1')).toBe(true);
  });

  it('does not stabilize a unit outside commandRange', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', // V1 commandRange = 2
    } as Unit;
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 5, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    expect(getPassiveStabilizationTargets(state, 'player').has('unit-1')).toBe(false);
  });

  it('never stabilizes a unit that is already full supply or stable-unsupported (nothing to pause)', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar',
    } as Unit;
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    expect(getPassiveStabilizationTargets(state, 'player').has('unit-1')).toBe(false);
  });

  it('respects commandCapacity — closest-eligible-first, stable tie-breaker beyond capacity', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', // V1 commandCapacity = 3
    } as Unit;
    const degraded = { state: 'degraded' as const, hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = {
        id: `unit-${i}`, type: 'warrior', owner: 'player', position: { q: i === 4 ? 2 : 1, r: 0 },
        movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        landSupply: degraded,
      } as Unit;
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];

    const targets = getPassiveStabilizationTargets(state, 'player');
    expect(targets.size).toBe(3); // capacity-capped
  });

  it('a General on its spawn turn (generalNoCommandThisTurn) stabilizes nothing', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', generalNoCommandThisTurn: true,
    } as Unit;
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    expect(getPassiveStabilizationTargets(state, 'player').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: FAIL — `getPassiveStabilizationTargets` is not exported.

- [ ] **Step 3: Implement `getPassiveStabilizationTargets` in `great-general-system.ts`**

Add near `getEffectiveCommandStats` (it's the sibling read this function
composes with):

```ts
import { mapDistance } from '@/systems/hex-utils';

/**
 * #544 MR4 contract §16: "within commandRange, up to commandCapacity
 * eligible out-of-supply units can have degradation paused... automatic
 * every turn... priority: closest eligible, then stable tie-breaker."
 * "Eligible" here means the unit would otherwise advance its overextension
 * stage this round (owned by civId, out of supply, in hostile territory) --
 * pausing a unit with no active degradation clock (full/stable-unsupported)
 * is a no-op, so those are excluded rather than wastefully "stabilized."
 * Computed once per civ per round by resolveLandSupplyForCiv, mirroring
 * that function's existing per-civ precompute discipline (contract §35).
 * Each eligible General independently fills its own capacity from the full
 * eligible pool -- overlapping General ranges do not compete for the same
 * capacity budget, they simply produce a redundant (harmless) stabilization
 * of the same unit.
 */
export function getPassiveStabilizationTargets(state: GameState, civId: string): Set<string> {
  const civ = state.civilizations[civId];
  if (!civ) return new Set();

  const civUnits = civ.units.map(id => state.units[id]).filter((u): u is Unit => Boolean(u));
  const generals = civUnits.filter(
    u => u.type === 'great_general' && u.generalDefinitionId && !u.generalNoCommandThisTurn,
  );
  const degradingUnits = civUnits.filter(
    u => u.landSupply !== undefined
      && (u.landSupply.state === 'grace' || u.landSupply.state === 'degraded' || u.landSupply.state === 'severe'),
  );

  const stabilized = new Set<string>();
  for (const general of generals) {
    const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
    if (!definition) continue;
    const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);

    const inRange = degradingUnits
      .map(u => ({ unit: u, distance: mapDistance(state.map, general.position, u.position) }))
      .filter(entry => entry.distance <= commandRange)
      .sort((a, b) => a.distance - b.distance || a.unit.id.localeCompare(b.unit.id));

    for (const entry of inRange.slice(0, commandCapacity)) {
      stabilized.add(entry.unit.id);
    }
  }
  return stabilized;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `advanceOverextensionStage`'s new parameter**

```ts
// tests/systems/supply-progression.test.ts (append to existing describe block for advanceOverextensionStage)
it('#544 MR4: stabilizedByGeneral freezes the current stage instead of advancing it', () => {
  const current: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };
  const result = advanceOverextensionStage(current, 'hostile', false, true);
  expect(result.state).toBe('degraded');
  expect(result.hostileUnsupportedTurns).toBe(3); // frozen, not incremented to 4
});

it('#544 MR4: stabilizedByGeneral defaults to false, preserving MR1-MR3 behavior', () => {
  const current: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };
  const result = advanceOverextensionStage(current, 'hostile', false);
  expect(result.state).toBe('severe');
  expect(result.hostileUnsupportedTurns).toBe(4);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-progression.test.ts`
Expected: FAIL — passing a 4th argument doesn't change behavior yet (function ignores it).

- [ ] **Step 7: Implement the parameter in `supply-progression.ts`**

```ts
// src/systems/supply-progression.ts:25-38
export function advanceOverextensionStage(
  current: UnitLandSupplyStatus,
  territoryClass: LandSupplyTerritoryClass,
  isSupplied: boolean,
  stabilizedByGeneral: boolean = false,
): UnitLandSupplyStatus {
  if (isSupplied) {
    return { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: current.suppliedTurnsSinceRecovery };
  }
  if (territoryClass !== 'hostile') {
    return { state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
  }
  // #544 MR4 contract §16: passive command stabilization "pauses" degradation
  // -- it does not clear the current stage/counter, only prevents the next
  // worsening step this round.
  if (stabilizedByGeneral) {
    return current;
  }
  const hostileUnsupportedTurns = current.hostileUnsupportedTurns + 1;
  return { state: stageForHostileTurns(hostileUnsupportedTurns), hostileUnsupportedTurns, suppliedTurnsSinceRecovery: 0 };
}
```

Also delete the now-outdated "Extensibility seam, not implemented now" docblock
above this function (its promise is now fulfilled) and replace it with a
one-line pointer:

```ts
/** #544 MR4: stabilizedByGeneral is fed by
 * great-general-system.ts's getPassiveStabilizationTargets, composed once
 * per civ per round in supply-system.ts's resolveLandSupplyForCiv. */
```

- [ ] **Step 8: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-progression.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing integration test for `resolveLandSupplyForCiv`**

```ts
// tests/systems/supply-system.test.ts (append)
it('#544 MR4: a unit within an operational General\'s command range does not advance its overextension stage', () => {
  const state = /* ...build a minimal hostile-territory state, matching this
    file's existing fixture-building convention for resolveLandSupplyForCiv
    tests -- read the top of the file for the exact helper it already uses
    before duplicating one here... */;
  state.units['gen-1'] = { /* ... great_general at the unit's position, generalDefinitionId: 'gen_caesar' */ } as Unit;
  state.units['unit-1'].landSupply = { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };

  const result = resolveLandSupplyForCiv(state, 'player');
  expect(result.units['unit-1'].landSupply!.state).toBe('degraded'); // not 'severe'
  expect(result.units['unit-1'].landSupply!.hostileUnsupportedTurns).toBe(3); // frozen
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-system.test.ts`
Expected: FAIL — unit still advances to `severe`.

- [ ] **Step 11: Wire `getPassiveStabilizationTargets` into `resolveLandSupplyForCiv`**

```ts
// src/systems/supply-system.ts
import { getPassiveStabilizationTargets } from './great-general-system';

export function resolveLandSupplyForCiv(state: GameState, civId: string): GameState {
  const shoreAssignments = getNavalShoreSupplyAssignments(state, civId);
  const sourceCandidates = getCivSupplySourceCandidates(state, civId);
  // #544 MR4: computed once per civ per round, same discipline as
  // sourceCandidates above (contract §35 -- avoid unbounded per-unit scans).
  const passiveStabilizationTargets = getPassiveStabilizationTargets(state, civId);
  let units = state.units;
  let changed = false;

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId || unit.transportId) continue;
    if (!unitParticipatesInLandSupply(unit)) continue;

    const tile = state.map.tiles[hexKey(unit.position)];
    const territoryClass = classifyLandSupplyTerritory(state, civId, tile?.owner ?? null);
    const coveredByLandSource = getLandSupplySourceCoverage(state, civId, unit.position, sourceCandidates);
    const isSupplied = coveredByLandSource || shoreAssignments.has(unit.id);
    // #544 MR4: a General's passive stabilization aura AND Rally's one-round
    // protection both feed the same stabilizedByGeneral input -- Rally is
    // itself a General intervention, so folding it into the same boolean
    // matches supply-progression.ts's single documented extension point
    // instead of adding a second parameter.
    const stabilizedByGeneral = passiveStabilizationTargets.has(unit.id) || unit.rallyProtectedThisRound === true;

    const current: UnitLandSupplyStatus = unit.landSupply ?? { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
    const isOnStabilizedBaseTile = sourceCandidates.cities.some(city => hexKey(city.position) === hexKey(unit.position))
      || sourceCandidates.fortCoords.some(fortCoord => hexKey(fortCoord) === hexKey(unit.position));
    const attackedThisTurn = unit.hasActed === true;

    const next = isSupplied
      ? resolveSupplyRecoveryForUnit(current, true, isOnStabilizedBaseTile, attackedThisTurn)
      : advanceOverextensionStage(current, territoryClass, false, stabilizedByGeneral);

    if (next !== current || unit.landSupply === undefined) {
      units = units === state.units ? { ...state.units } : units;
      units[unit.id] = { ...unit, landSupply: next };
      changed = true;
    }
  }

  return changed ? { ...state, units } : state;
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-system.test.ts`
Expected: PASS

- [ ] **Step 13: Run the full suite to check for regressions in existing MR1 supply tests**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-system.test.ts tests/systems/supply-progression.test.ts tests/systems/great-general-system.test.ts`
Expected: All PASS (default-`false`/absent-General behavior is unchanged).

- [ ] **Step 14: Commit**

```bash
git add src/systems/great-general-system.ts src/systems/supply-progression.ts src/systems/supply-system.ts tests/systems/great-general-system.test.ts tests/systems/supply-progression.test.ts tests/systems/supply-system.test.ts
git commit -m "feat(#544): MR4 Task 4 — passive command stabilization"
```

---

### Task 5: Rally

**Files:**
- Modify: `src/systems/great-general-abilities.ts`
- Test: `tests/systems/great-general-abilities.test.ts`

**Interfaces:**
- Consumes: `getHeroicCommandEligibility`/`spendHeroicCommandCharge` (Task 3);
  `getEffectiveCommandStats` (`great-general-system.ts`, MR3); `mapDistance`
  (`hex-utils.ts`); `GENERAL_DEFINITIONS` (Task 1).
- Produces: `RallyTarget { unitId: string; healthBefore: number; healthAfter: number;
  stageBefore: LandSupplyState; stageAfter: LandSupplyState }`;
  `RallyPreview { eligibility: HeroicCommandEligibility; targets: RallyTarget[] }`;
  `getRallyPreview(state, generalUnitId): RallyPreview`;
  `issueRally(state, generalUnitId): GameState`. Task 11 (UI) consumes
  `getRallyPreview`; the controller wiring in Task 11 calls `issueRally` on
  confirm.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-abilities.test.ts (append)
import { getRallyPreview, issueRally } from '@/systems/great-general-abilities';

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  } as Unit;
}

describe('getRallyPreview / issueRally', () => {
  function setup(sevrity: 'grace' | 'degraded' | 'severe' = 'severe', health = 40) {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = makeUnit({
      health,
      landSupply: { state: sevrity, hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    return state;
  }

  it('previews the stage transition: severe -> degraded', () => {
    const preview = getRallyPreview(setup('severe'), 'gen-1');
    expect(preview.targets).toHaveLength(1);
    expect(preview.targets[0].stageBefore).toBe('severe');
    expect(preview.targets[0].stageAfter).toBe('degraded');
  });

  it('previews the stage transition: degraded -> grace', () => {
    const preview = getRallyPreview(setup('degraded'), 'gen-1');
    expect(preview.targets[0].stageAfter).toBe('grace');
  });

  it('grace does not reduce further (contract §18: "no extra stage reduction")', () => {
    const preview = getRallyPreview(setup('grace'), 'gen-1');
    expect(preview.targets[0].stageAfter).toBe('grace');
  });

  it('restores bounded HP up to 100, never above', () => {
    const preview = getRallyPreview(setup('severe', 90), 'gen-1');
    expect(preview.targets[0].healthAfter).toBe(100);
    expect(preview.targets[0].healthAfter).toBeLessThanOrEqual(100);
  });

  it('does NOT set Full Supply (contract §18: "Rally does not make units Full Supply")', () => {
    const state = setup('severe');
    const result = issueRally(state, 'gen-1');
    expect(result.units['unit-1'].landSupply!.state).not.toBe('full');
    expect(result.units['unit-1'].landSupply!.state).toBe('degraded');
  });

  it('sets rallyProtectedThisRound on every targeted unit', () => {
    const result = issueRally(setup('severe'), 'gen-1');
    expect(result.units['unit-1'].rallyProtectedThisRound).toBe(true);
  });

  it('spends exactly one charge and starts the shared cooldown', () => {
    const state = { ...setup('severe'), turn: 3 };
    const result = issueRally(state, 'gen-1');
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
    expect(result.units['gen-1'].generalCommandCooldownUntilTurn).toBe(13);
  });

  it('is a no-op when the General is ineligible (e.g. on cooldown)', () => {
    const state = setup('severe');
    state.units['gen-1'] = { ...state.units['gen-1'], generalCommandCooldownUntilTurn: 999 };
    const result = issueRally(state, 'gen-1');
    expect(result).toBe(state);
  });

  it('does NOT spend a charge when there are zero eligible targets (review fix: never waste a lifetime charge on a no-op)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-4' });
    state.units['gen-1'] = makeGeneral(); // no other units in range at all
    state.civilizations.player.units = ['gen-1'];
    const result = issueRally(state, 'gen-1');
    expect(result).toBe(state);
    expect(result.units['gen-1'].generalCommandChargesUsed).toBeUndefined();
  });

  it('excludes full-supply and stable-unsupported units from targeting', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-2' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = makeUnit({ landSupply: { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 } });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    expect(getRallyPreview(state, 'gen-1').targets).toHaveLength(0);
  });

  it('prioritizes by missing HP and stage severity, capped at commandCapacity', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-3' });
    state.units['gen-1'] = makeGeneral(); // V1 commandCapacity = 3
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = makeUnit({
        id: `unit-${i}`, health: 100 - i * 10,
        landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
      });
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];
    const preview = getRallyPreview(state, 'gen-1');
    expect(preview.targets).toHaveLength(3);
    // unit-4 has the most missing HP (60) -- must be included over unit-1 (least missing HP, 90)
    expect(preview.targets.map(t => t.unitId)).toContain('unit-4');
    expect(preview.targets.map(t => t.unitId)).not.toContain('unit-1');
  });
});
```

Add a shared `makeGeneral()` helper at the top of the test file if Task 3's
tests didn't already leave one in module scope (they did — reuse it, don't
redefine).

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-abilities.test.ts`
Expected: FAIL — `getRallyPreview`/`issueRally` not exported.

- [ ] **Step 3: Write the implementation**

```ts
// src/systems/great-general-abilities.ts (append)
import type { LandSupplyState, UnitLandSupplyStatus } from '@/core/types';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { getEffectiveCommandStats } from '@/systems/great-general-system';
import { mapDistance } from '@/systems/hex-utils';

const RALLY_HEAL_AMOUNT = 30; // contract §18: "exact HP is data-driven and not locked"

/** contract §18: severe -> degraded, degraded -> grace, grace -> grace (no
 * further reduction). full/stable-unsupported are not eligible targets at
 * all (filtered out before this ever runs). */
function rallyStageAfter(stage: LandSupplyState): LandSupplyState {
  if (stage === 'severe') return 'degraded';
  if (stage === 'degraded') return 'grace';
  return stage;
}

function stageSeverityWeight(stage: LandSupplyState): number {
  if (stage === 'severe') return 50;
  if (stage === 'degraded') return 30;
  if (stage === 'grace') return 10;
  return 0;
}

export interface RallyTarget {
  unitId: string;
  healthBefore: number;
  healthAfter: number;
  stageBefore: LandSupplyState;
  stageAfter: LandSupplyState;
}

export interface RallyPreview {
  eligibility: HeroicCommandEligibility;
  targets: RallyTarget[];
}

function getRallyEligibleTargets(state: GameState, general: Unit, definition: { commandRange: number; commandCapacity: number }): RallyTarget[] {
  const civ = state.civilizations[general.owner];
  if (!civ) return [];
  const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);

  const candidates = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.id !== general.id)
    .filter(u => u.landSupply !== undefined
      && (u.landSupply.state === 'grace' || u.landSupply.state === 'degraded' || u.landSupply.state === 'severe'))
    .filter(u => mapDistance(state.map, general.position, u.position) <= commandRange)
    .map(u => ({
      unit: u,
      priority: (100 - u.health) + stageSeverityWeight(u.landSupply!.state),
    }))
    .sort((a, b) => b.priority - a.priority || a.unit.id.localeCompare(b.unit.id))
    .slice(0, commandCapacity);

  return candidates.map(({ unit }) => ({
    unitId: unit.id,
    healthBefore: unit.health,
    healthAfter: Math.min(100, unit.health + RALLY_HEAL_AMOUNT),
    stageBefore: unit.landSupply!.state,
    stageAfter: rallyStageAfter(unit.landSupply!.state),
  }));
}

/** contract §18/§24: "automatic targeting with preview" -- no player
 * selection step, the panel just shows what Rally will do and Confirm/Cancel. */
export function getRallyPreview(state: GameState, generalUnitId: string): RallyPreview {
  const general = state.units[generalUnitId];
  const eligibility = general
    ? getHeroicCommandEligibility(state, general)
    : { eligible: false, reason: 'General not found.', chargesRemaining: 0, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  if (!general || !eligibility.eligible) return { eligibility, targets: [] };

  const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
  if (!definition) return { eligibility, targets: [] };

  return { eligibility, targets: getRallyEligibleTargets(state, general, definition) };
}

export function issueRally(state: GameState, generalUnitId: string): GameState {
  const preview = getRallyPreview(state, generalUnitId);
  // #544 MR4 review fix: a General has only 3 lifetime charges on a ~10-turn
  // shared cooldown -- burning one on a misclick with zero eligible targets
  // (nothing nearby needs Rally) would be a punishing, confusing waste of a
  // scarce resource. Mirrors issueLastStand's existing empty-targets guard;
  // issueSeizeTheMoment gets the same treatment below for the same reason.
  if (!preview.eligibility.eligible || preview.targets.length === 0) return state;

  let units = { ...state.units };
  for (const target of preview.targets) {
    const unit = units[target.unitId];
    if (!unit || !unit.landSupply) continue;
    units[target.unitId] = {
      ...unit,
      health: target.healthAfter,
      landSupply: { ...unit.landSupply, state: target.stageAfter },
      rallyProtectedThisRound: true,
    };
  }

  return spendHeroicCommandCharge({ ...state, units }, generalUnitId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-abilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-abilities.ts tests/systems/great-general-abilities.test.ts
git commit -m "feat(#544): MR4 Task 5 — Rally"
```

---

### Task 6: Seize the Moment, and the no-chained-capture guard

**Files:**
- Modify: `src/systems/great-general-abilities.ts`
- Modify: `src/systems/city-capture-system.ts:103-115,190-375` (`MajorCityAssaultFailureReason`, `beginMajorCityAssault`)
- Test: `tests/systems/great-general-abilities.test.ts`, `tests/systems/city-capture-system.test.ts`

**Interfaces:**
- Consumes: `getHeroicCommandEligibility`/`spendHeroicCommandCharge` (Task 3);
  `getEffectiveCommandStats` (MR3); `mapDistance` (`hex-utils.ts`).
- Produces: `SeizeEligibleUnit { unitId: string; label: string }`;
  `getSeizeTheMomentEligibleUnits(state, generalUnitId): { eligibility: HeroicCommandEligibility; eligible: SeizeEligibleUnit[] }`;
  `issueSeizeTheMoment(state, generalUnitId, selectedUnitIds: string[]): GameState`;
  `Unit.hasCapturedCityThisTurn?: boolean` now actually read (Task 1 declared
  the field; this task is its first and only writer/reader).

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-abilities.test.ts (append)
import { getSeizeTheMomentEligibleUnits, issueSeizeTheMoment } from '@/systems/great-general-abilities';

describe('getSeizeTheMomentEligibleUnits / issueSeizeTheMoment', () => {
  function setup() {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = makeUnit({ id: 'unit-1', position: { q: 1, r: 0 }, hasActed: true, hasMoved: true, movementPointsLeft: 0 });
    state.units['unit-2'] = makeUnit({ id: 'unit-2', position: { q: 1, r: 1 }, hasActed: false, hasMoved: false, movementPointsLeft: 2 });
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2'];
    return state;
  }

  it('lists only units that have already acted this turn (contract §19: "must have already used normal action")', () => {
    const { eligible } = getSeizeTheMomentEligibleUnits(setup(), 'gen-1');
    expect(eligible.map(e => e.unitId)).toEqual(['unit-1']);
  });

  it('labels each eligible unit with its real display name and HP, not the raw internal type string (review fix)', () => {
    const { eligible } = getSeizeTheMomentEligibleUnits(setup(), 'gen-1');
    expect(eligible[0].label).not.toBe('warrior'); // not the bare UnitType string
    expect(eligible[0].label).toMatch(/warrior/i); // UNIT_DEFINITIONS.warrior.name contains "Warrior"
    expect(eligible[0].label).toContain('HP');
  });

  it('resets hasActed on selected units so they can act again', () => {
    const result = issueSeizeTheMoment(setup(), 'gen-1', ['unit-1']);
    expect(result.units['unit-1'].hasActed).toBe(false);
  });

  it('does NOT restore movementPointsLeft (contract §19: "no full movement refresh")', () => {
    const state = setup();
    state.units['unit-1'] = { ...state.units['unit-1'], movementPointsLeft: 0 };
    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-1']);
    expect(result.units['unit-1'].movementPointsLeft).toBe(0);
  });

  it('leaves an unselected eligible unit untouched', () => {
    const result = issueSeizeTheMoment(setup(), 'gen-1', ['unit-1']);
    expect(result.units['unit-2'].hasActed).toBe(false); // was already false, unchanged
    expect(result.units['unit-2'].hasMoved).toBe(false);
  });

  it('ignores a selected id that is not actually eligible, and does not spend a charge if that leaves zero valid activations', () => {
    const state = setup();
    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-2']); // unit-2 has NOT acted -- ineligible, so toActivate ends up empty
    expect(result.units['unit-2'].hasActed).toBe(false); // unchanged from its already-false starting value
    expect(result).toBe(state); // review fix: no valid activation -> no charge spent
    expect(result.units['gen-1'].generalCommandChargesUsed).toBeUndefined();
  });

  it('spends exactly one charge regardless of how many units were selected', () => {
    const state = { ...setup(), turn: 2 };
    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-1']);
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
  });

  it('does NOT spend a charge when confirmed with an empty selection', () => {
    const state = setup();
    const result = issueSeizeTheMoment(state, 'gen-1', []);
    expect(result).toBe(state); // referential no-op
    expect(result.units['gen-1'].generalCommandChargesUsed).toBeUndefined();
  });

  it('caps eligible-unit selection at commandCapacity when previewing', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-2' });
    state.units['gen-1'] = makeGeneral(); // V1 commandCapacity = 3
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = makeUnit({ id: `unit-${i}`, position: { q: 1, r: 0 }, hasActed: true });
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];
    // eligible LIST may show all in-range acted units -- capacity is enforced
    // at issuance (selecting more than commandCapacity ids is truncated),
    // matching Rally's "capacity caps the effect, not the candidate list" shape
    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-1', 'unit-2', 'unit-3', 'unit-4']);
    const resetCount = ['unit-1', 'unit-2', 'unit-3', 'unit-4'].filter(id => result.units[id].hasActed === false).length;
    expect(resetCount).toBe(3);
  });
});

describe('#544 MR4 — no chained city captures in city-capture-system.test.ts', () => {
  // See Step 6 below -- this describe block is added to
  // tests/systems/city-capture-system.test.ts, not this file.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-abilities.test.ts`
Expected: FAIL — `getSeizeTheMomentEligibleUnits`/`issueSeizeTheMoment` not exported.

- [ ] **Step 3: Write the implementation**

```ts
// src/systems/great-general-abilities.ts (append)
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export interface SeizeEligibleUnit {
  unitId: string;
  label: string;
}

/** contract §19: player-selected, so this returns the full in-range/acted
 * candidate pool for the UI to render as checkboxes -- capacity is enforced
 * at issuance time (Step below), not here, so the picker can show "N of
 * commandCapacity selected" feedback rather than silently truncating the list. */
export function getSeizeTheMomentEligibleUnits(
  state: GameState,
  generalUnitId: string,
): { eligibility: HeroicCommandEligibility; eligible: SeizeEligibleUnit[] } {
  const general = state.units[generalUnitId];
  const eligibility = general
    ? getHeroicCommandEligibility(state, general)
    : { eligible: false, reason: 'General not found.', chargesRemaining: 0, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  if (!general || !eligibility.eligible) return { eligibility, eligible: [] };

  const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
  const civ = state.civilizations[general.owner];
  if (!definition || !civ) return { eligibility, eligible: [] };
  const { commandRange } = getEffectiveCommandStats(general, definition);

  const eligible = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.id !== general.id)
    .filter(u => u.hasActed === true)
    .filter(u => mapDistance(state.map, general.position, u.position) <= commandRange)
    .sort((a, b) => a.id.localeCompare(b.id))
    // #544 MR4 review fix: raw UnitType strings (e.g. 'great_general',
    // multi-word types) are internal identifiers, not player-facing names --
    // this codebase's convention for the real display name is
    // UNIT_DEFINITIONS[type].name (see the 'great_general' entry itself:
    // `{ type: 'great_general', name: 'Great General', ... }`). HP is
    // appended so two units of the same type in the same picker (a common
    // case -- Seize is most useful with several units acting together) are
    // visually distinguishable without cross-referencing map position.
    .map(u => ({ unitId: u.id, label: `${UNIT_DEFINITIONS[u.type]?.name ?? u.type} (${u.health} HP)` }));

  return { eligibility, eligible };
}

/**
 * contract §19: "bounded extra action budget, not a full reset... at most
 * one additional attack, no full movement refresh, no reset of
 * cooldowns/charges/ammo-like state." Only hasActed is cleared -- hasMoved
 * stays true and movementPointsLeft is untouched, so a unit can only
 * reposition with whatever movement it already had left over, and gets
 * exactly one more legal attack. selectedUnitIds beyond commandCapacity are
 * silently truncated (stable order: eligible-list order, i.e. id-sorted).
 */
export function issueSeizeTheMoment(
  state: GameState,
  generalUnitId: string,
  selectedUnitIds: string[],
): GameState {
  const { eligibility, eligible } = getSeizeTheMomentEligibleUnits(state, generalUnitId);
  if (!eligibility.eligible) return state;

  const general = state.units[generalUnitId];
  const definition = GENERAL_DEFINITIONS.find(g => g.id === general?.generalDefinitionId);
  if (!general || !definition) return state;
  const { commandCapacity } = getEffectiveCommandStats(general, definition);

  const eligibleIds = new Set(eligible.map(e => e.unitId));
  const toActivate = selectedUnitIds.filter(id => eligibleIds.has(id)).slice(0, commandCapacity);
  // #544 MR4 review fix: mirrors issueRally's zero-target guard -- confirming
  // Seize with no valid selection (empty array, or every selected id turned
  // out ineligible) must not burn one of the General's 3 lifetime charges on
  // nothing happening.
  if (toActivate.length === 0) return state;

  let units = { ...state.units };
  for (const unitId of toActivate) {
    const unit = units[unitId];
    if (!unit) continue;
    units[unitId] = { ...unit, hasActed: false, hasMoved: false };
  }

  return spendHeroicCommandCharge({ ...state, units }, generalUnitId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-abilities.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the no-chained-capture guard**

The right integration point is `beginMajorCityAssault` (`city-capture-system.ts:190`),
**not** `resolveMajorCityCapture` — `resolveMajorCityCapture(state, cityId,
newOwnerId, disposition, turn, bus?)` finalizes a disposition choice at the
civ level and never receives a unit id at all; `beginMajorCityAssault(state,
attackerId, cityId, options)` is the actual per-unit entry point that moves
an attacking unit into an undefended (or just-cleared) city and is the only
place that both knows the specific attacking unit and gates whether this
occupation is allowed to happen (`canUnitOccupyCity`, `city-defended`,
`not-adjacent`, etc. are already gated here).

```ts
// tests/systems/city-capture-system.test.ts (append, using this file's
// existing beginMajorCityAssault fixture-building convention — an attacking
// unit adjacent to an undefended enemy city, matching the existing
// 'city-defended'/'not-adjacent' test coverage already in this file)
describe('#544 MR4 — no chained city captures in one turn', () => {
  it('a unit that already captured a city this turn cannot begin a second assault', () => {
    const { state, attackerId, cityId } = /* existing fixture helper */;
    state.units[attackerId] = { ...state.units[attackerId], hasCapturedCityThisTurn: true };

    const result = beginMajorCityAssault(state, attackerId, cityId, { actor: 'player', civId: state.units[attackerId].owner });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('already-captured-city-this-turn');
  });

  it('sets hasCapturedCityThisTurn on the attacker after a successful undefended-city occupation', () => {
    const { state, attackerId, cityId } = /* existing fixture helper */;
    const result = beginMajorCityAssault(state, attackerId, cityId, { actor: 'player', civId: state.units[attackerId].owner });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.units[attackerId].hasCapturedCityThisTurn).toBe(true);
  });

  it('sets hasCapturedCityThisTurn on the attacker after a post-combat advance into a cleared city', () => {
    const { state, attackerId, cityId, precedingCombat } = /* existing precedingCombat fixture already used by this file's 'invalid-post-combat-advance' coverage */;
    const result = beginMajorCityAssault(state, attackerId, cityId, { actor: 'player', civId: state.units[attackerId].owner, precedingCombat });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.units[attackerId].hasCapturedCityThisTurn).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-capture-system.test.ts`
Expected: FAIL — `'already-captured-city-this-turn'` is not a recognized
reason (type error) and the flag is never set.

- [ ] **Step 7: Add the guard and the flag write to `beginMajorCityAssault`**

Add the new reason to the failure union (`city-capture-system.ts:103-115`):

```ts
export type MajorCityAssaultFailureReason =
  | 'missing-attacker'
  | 'missing-city'
  | 'wrong-owner'
  | 'friendly-city'
  | 'not-major-city'
  | 'not-at-war'
  | 'cannot-capture'
  | 'not-adjacent'
  | 'city-defended'
  | 'illegal-movement'
  | 'invalid-post-combat-advance'
  | 'repelled-by-city-defense'
  /** #544 MR4 contract §19: "a unit may not chain multiple captures in the
   * same turn." Seize the Moment is the mechanism that can put a second
   * capture opportunity in front of the same unit in one turn -- this guard
   * is generic (not Seize-specific), gating the single per-unit city-
   * occupation entry point uniformly for every caller (player, AI, Seize). */
  | 'already-captured-city-this-turn';
```

Add the guard right after the existing `if (!attacker) return
assaultFailure(state, 'missing-attacker');` check (`city-capture-system.ts:196-197`):

```ts
  const attacker = state.units[attackerId];
  if (!attacker) return assaultFailure(state, 'missing-attacker');
  if (attacker.hasCapturedCityThisTurn) return assaultFailure(state, 'already-captured-city-this-turn');
```

Set the flag in **both** success paths. In the `precedingCombat` branch
(`city-capture-system.ts:242-248`):

```ts
    nextState.units[attackerId] = {
      ...nextState.units[attackerId],
      position: to,
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
      hasCapturedCityThisTurn: true,
    };
```

And in the non-`precedingCombat` branch, after the successful
`executeUnitMove` (`city-capture-system.ts:356-361`):

```ts
    nextState.units[attackerId] = {
      ...nextState.units[attackerId],
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
      hasCapturedCityThisTurn: true,
    };
```

Optionally, check whether a UI-facing failure-message map exists for
`MajorCityAssaultFailureReason` (grep `repelled-by-city-defense` across
`src/app/` and `src/ui/` — as of this plan's writing, both known call sites
in `map-interaction-controller.ts` and `player-action-controller.ts` already
fall through to a generic `'The attack could not proceed.'` message for any
reason other than `'repelled-by-city-defense'`, so `'already-captured-city-this-turn'`
gets a reasonable default message for free with zero UI changes required —
confirm this is still true before skipping a UI change).

**Correction to the earlier "review fix" (2026-08-24, during implementation)
— the second gap does not actually exist.** The pre-implementation review
pass flagged `ai-tactics.ts`'s `'capture-city'` case (inside
`applyPredictedAction`) as a second real capture path bypassing
`beginMajorCityAssault`, based on a plain grep for `resolveMajorCityCapture(`
call sites. On closer reading at implementation time, that function's own
name and its one caller — `scratch = applyPredictedAction(scratch,
scratchContext, selected.action)` inside `chooseTacticalSequence`
(`ai-tactics.ts:1276`) — show it is a **scratch/lookahead simulation** used
only to *score* candidate multi-action sequences; its returned state is
discarded, never committed as real game state. The actual AI execution path
for a chosen `'capture-city'` action is `executeAction`
(`ai-major-turn.ts:342`) → `occupyMajorCity` (`ai-major-turn.ts:122`), which
already calls `beginMajorCityAssault` directly (confirmed by reading
`occupyMajorCity`'s body) — so it was already covered by this task's guard
before this correction, and the "covers every caller uniformly" claim
earlier in this task holds. **No change to `ai-tactics.ts` is needed.**
Left in the plan as a recorded correction, not deleted, so a future reader
doesn't wonder whether the same grep-only mistake needs re-checking — it
doesn't; the distinction (real execution vs. discarded scoring scratch) is
now verified, not assumed. If MR5 ever makes `applyPredictedAction`'s
*scoring* of a hypothetical Seize-enabled sequence over/under-value a second
capture it can't actually get, that's a legitimate AI-planning-quality
question for MR5 to pick up on its own merits — not a game-state-correctness
bug this task needs to guard against speculatively today.

- [ ] **Step 8: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-capture-system.test.ts`
Expected: PASS

- [ ] **Step 9: Verify `hasCapturedCityThisTurn` is cleared by `resetUnitTurn`**

This flag needs the same owner-turn-reset treatment as
`rallyProtectedThisRound` (Task 2). Add it to the same destructure in
`resetUnitTurn` (`src/systems/unit-system.ts`):

```ts
const {
  skippedTurn: _skippedTurn,
  interceptedTurn: _interceptedTurn,
  revealedThisTurn: _revealedThisTurn,
  generalNoCommandThisTurn: _generalNoCommandThisTurn,
  rallyProtectedThisRound: _rallyProtectedThisRound,
  hasCapturedCityThisTurn: _hasCapturedCityThisTurn,
  ...rest
} = unit;
```

Add one more assertion to Task 2's `resetUnitTurn` test file confirming this
clears too, then re-run:

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/unit-system.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/systems/great-general-abilities.ts src/systems/city-capture-system.ts src/systems/unit-system.ts tests/systems/great-general-abilities.test.ts tests/systems/city-capture-system.test.ts tests/systems/unit-system.test.ts
git commit -m "feat(#544): MR4 Task 6 — Seize the Moment and no-chained-capture guard"
```

---

### Task 7: Last Stand — eligibility, issuance, and the defense-bonus modifier

**Files:**
- Modify: `src/systems/great-general-abilities.ts`
- Modify: `src/systems/combat-context.ts:59-165` (`buildCombatContextForDefender`)
- Modify: `src/systems/combat-system.ts:177-345` (`CombatContext`, `calculateCombatStrengths`)
- Test: `tests/systems/great-general-abilities.test.ts`, `tests/systems/combat-system.test.ts`
  (this codebase tests `buildCombatContextForDefender` from `combat-context.ts`
  inside `combat-system.test.ts`, not a separate file — confirmed by grep,
  there is no `tests/systems/combat-context.test.ts`)

**Interfaces:**
- Consumes: `getHeroicCommandEligibility`/`spendHeroicCommandCharge` (Task 3);
  `getEffectiveCommandStats` (MR3); `mapHexesInRange` (`hex-utils.ts`);
  `UNIT_CLASS_BY_TYPE` (`unit-modifier-definitions.ts`).
- Produces: `LastStandTarget { unitId: string }`; `LastStandPreview { eligibility, targetHex, area: HexCoord[], targets: LastStandTarget[], defenseBonusPercent: number, durationTurns: number }`;
  `getLastStandPreview(state, generalUnitId, targetHex): LastStandPreview`;
  `issueLastStand(state, generalUnitId, targetHex): GameState`;
  `resolveLastStandDefenseBonus(unit, currentTurn): { multiplier: number; label?: string }`
  (Task 8 and `combat-context.ts` both consume this last one).

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-abilities.test.ts (append)
import { getLastStandPreview, issueLastStand, resolveLastStandDefenseBonus } from '@/systems/great-general-abilities';

describe('getLastStandPreview / issueLastStand', () => {
  function setup() {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-1' });
    state.units['gen-1'] = makeGeneral(); // position { q:0, r:0 }, V1 commandRange=2, commandCapacity=3
    state.units['unit-1'] = makeUnit({ id: 'unit-1', position: { q: 1, r: 0 } }); // in the target area
    state.units['worker-1'] = { ...makeUnit({ id: 'worker-1', position: { q: 1, r: 0 } }), type: 'worker' }; // civilian -- must be excluded
    state.civilizations.player.units = ['gen-1', 'unit-1', 'worker-1'];
    return state;
  }

  it('rejects a target hex outside commandRange', () => {
    const state = setup();
    const preview = getLastStandPreview(state, 'gen-1', { q: 10, r: 10 });
    expect(preview.targets).toHaveLength(0);
  });

  it('includes combat units in the target area but excludes civilians', () => {
    const preview = getLastStandPreview(setup(), 'gen-1', { q: 1, r: 0 });
    const ids = preview.targets.map(t => t.unitId);
    expect(ids).toContain('unit-1');
    expect(ids).not.toContain('worker-1');
  });

  it('caps affected units at commandCapacity', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-2' });
    state.units['gen-1'] = makeGeneral();
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = makeUnit({ id: `unit-${i}`, position: { q: 1, r: 0 } });
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];
    const preview = getLastStandPreview(state, 'gen-1', { q: 1, r: 0 });
    expect(preview.targets).toHaveLength(3);
  });

  it('issuing sets lastStandHold on every affected unit, sharing one formationId', () => {
    const result = issueLastStand(setup(), 'gen-1', { q: 1, r: 0 });
    const hold = result.units['unit-1'].lastStandHold;
    expect(hold).toBeDefined();
    expect(hold!.formationId).toBeTruthy();
    expect(hold!.defenseBonusMultiplier).toBeGreaterThan(1);
  });

  it('spends exactly one charge on issuance', () => {
    const state = { ...setup(), turn: 4 };
    const result = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
  });

  it('persists even conceptually after the General dies -- issuance does not reference the General again', () => {
    const state = { ...setup(), turn: 4 };
    const result = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    const withoutGeneral = { ...result, units: { ...result.units } };
    delete withoutGeneral.units['gen-1'];
    // resolveLastStandDefenseBonus reads only the unit's own lastStandHold, never the General
    expect(resolveLastStandDefenseBonus(withoutGeneral.units['unit-1'], withoutGeneral.turn).multiplier).toBeGreaterThan(1);
  });
});

describe('resolveLastStandDefenseBonus', () => {
  it('returns multiplier 1 for a unit with no lastStandHold', () => {
    expect(resolveLastStandDefenseBonus(makeUnit(), 5).multiplier).toBe(1);
  });

  it('returns the bonus multiplier while unexpired', () => {
    const unit = makeUnit({ lastStandHold: { formationId: 'f1', defenseBonusMultiplier: 1.15, expiresTurn: 10 } });
    const result = resolveLastStandDefenseBonus(unit, 8);
    expect(result.multiplier).toBe(1.15);
    expect(result.label).toBeTruthy();
  });

  it('returns multiplier 1 once expired', () => {
    const unit = makeUnit({ lastStandHold: { formationId: 'f1', defenseBonusMultiplier: 1.15, expiresTurn: 10 } });
    expect(resolveLastStandDefenseBonus(unit, 11).multiplier).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-abilities.test.ts`
Expected: FAIL — `getLastStandPreview`/`issueLastStand`/`resolveLastStandDefenseBonus` not exported.

- [ ] **Step 3: Write the implementation**

```ts
// src/systems/great-general-abilities.ts (append)
import { mapHexesInRange } from '@/systems/hex-utils';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import type { HexCoord, LastStandHoldState } from '@/core/types';

// contract §20: "moderate defensive bonus... exact defense/area/duration are
// data-driven and not locked." +15% sits between positioning's +10%/flanking
// tile and fortification's tier multipliers -- a deliberately "moderate,"
// not dominant, bonus for a rare 1-of-3-lifetime-uses ability.
const LAST_STAND_DEFENSE_MULTIPLIER = 1.15;
const LAST_STAND_AREA_RADIUS = 1; // target hex plus its immediate neighbors
const LAST_STAND_DURATION_TURNS = 2; // owner-turns the Hold save + bonus remain active

export interface LastStandTarget {
  unitId: string;
}

export interface LastStandPreview {
  eligibility: HeroicCommandEligibility;
  targetHex: HexCoord;
  area: HexCoord[];
  targets: LastStandTarget[];
  defenseBonusPercent: number;
  durationTurns: number;
}

function isLastStandEligibleUnitType(type: Unit['type']): boolean {
  return !UNIT_CLASS_BY_TYPE[type]?.includes('civilian');
}

function getLastStandArea(state: GameState, general: Unit, targetHex: HexCoord, commandRange: number): HexCoord[] | null {
  if (mapDistance(state.map, general.position, targetHex) > commandRange) return null;
  return mapHexesInRange(state.map, targetHex, LAST_STAND_AREA_RADIUS);
}

export function getLastStandPreview(state: GameState, generalUnitId: string, targetHex: HexCoord): LastStandPreview {
  const general = state.units[generalUnitId];
  const eligibility = general
    ? getHeroicCommandEligibility(state, general)
    : { eligible: false, reason: 'General not found.', chargesRemaining: 0, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  const empty: LastStandPreview = {
    eligibility, targetHex, area: [], targets: [],
    defenseBonusPercent: Math.round((LAST_STAND_DEFENSE_MULTIPLIER - 1) * 100),
    durationTurns: LAST_STAND_DURATION_TURNS,
  };
  if (!general || !eligibility.eligible) return empty;

  const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
  const civ = state.civilizations[general.owner];
  if (!definition || !civ) return empty;
  const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);

  const area = getLastStandArea(state, general, targetHex, commandRange);
  if (!area) return empty;
  const areaKeys = new Set(area.map(h => `${h.q},${h.r}`));

  const targets = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.id !== general.id)
    .filter(u => isLastStandEligibleUnitType(u.type))
    .filter(u => areaKeys.has(`${u.position.q},${u.position.r}`))
    .sort((a, b) => mapDistance(state.map, targetHex, a.position) - mapDistance(state.map, targetHex, b.position) || a.id.localeCompare(b.id))
    .slice(0, commandCapacity)
    .map(u => ({ unitId: u.id }));

  return { ...empty, area, targets };
}

export function issueLastStand(state: GameState, generalUnitId: string, targetHex: HexCoord): GameState {
  const preview = getLastStandPreview(state, generalUnitId, targetHex);
  if (!preview.eligibility.eligible || preview.targets.length === 0) return state;

  // Deterministic, unique-enough-per-issuance id -- no RNG needed (Global
  // Constraints: this MR never needs Math.random or seededLcg).
  const formationId = `${generalUnitId}-${state.turn}-${targetHex.q},${targetHex.r}`;
  const hold: LastStandHoldState = {
    formationId,
    defenseBonusMultiplier: LAST_STAND_DEFENSE_MULTIPLIER,
    expiresTurn: state.turn + LAST_STAND_DURATION_TURNS,
  };

  let units = { ...state.units };
  for (const target of preview.targets) {
    const unit = units[target.unitId];
    if (!unit) continue;
    units[target.unitId] = { ...unit, lastStandHold: hold };
  }

  return spendHeroicCommandCharge({ ...state, units }, generalUnitId);
}

/** Mirrors resolveLandSupplyCombatPenalty's { multiplier, label? } shape
 * (supply-combat.ts) so combat-context.ts wires both identically. */
export function resolveLastStandDefenseBonus(
  unit: Pick<Unit, 'lastStandHold'>,
  currentTurn: number,
): { multiplier: number; label?: string } {
  const hold = unit.lastStandHold;
  if (!hold || currentTurn > hold.expiresTurn) return { multiplier: 1 };
  return { multiplier: hold.defenseBonusMultiplier, label: `Last Stand +${Math.round((hold.defenseBonusMultiplier - 1) * 100)}%` };
}

/** #544 MR4 contract §20: "one shared formation-wide Hold! survival save."
 * Consumed exactly once per formation -- called by applyCombatOutcomeToState
 * (Task 8) the first time any member's Hold save actually triggers, clearing
 * lastStandHold from every unit sharing that formationId so no other member
 * can also be saved by the same one-time save. The passive defense bonus
 * this formation was granting also ends at that moment, which is intended:
 * once the formation has taken its one lethal hit, the "hold this ground"
 * moment is over. */
export function consumeLastStandHoldFormationWide(units: Record<string, Unit>, formationId: string): Record<string, Unit> {
  const next = { ...units };
  for (const [id, unit] of Object.entries(units)) {
    if (unit.lastStandHold?.formationId === formationId) {
      const { lastStandHold: _lastStandHold, ...rest } = unit;
      next[id] = rest as Unit;
    }
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-abilities.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test wiring the bonus into `CombatContext`**

```ts
// tests/systems/combat-system.test.ts (append, using this file's existing
// buildCombatContextForDefender fixture-building convention)
it('#544 MR4: an unexpired lastStandHold on the defender contributes defenderLastStandMultiplier', () => {
  const { state, attacker, defender } = /* existing fixture helper */;
  const held = { ...defender, lastStandHold: { formationId: 'f1', defenseBonusMultiplier: 1.15, expiresTurn: state.turn + 1 } };
  state.units[defender.id] = held;
  const context = buildCombatContextForDefender(state, attacker, held);
  expect(context.defenderLastStandMultiplier).toBe(1.15);
  expect(context.defenderLastStandFact?.label).toContain('Last Stand');
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-system.test.ts`
Expected: FAIL — `context.defenderLastStandMultiplier` is `undefined`.

- [ ] **Step 7: Wire `resolveLastStandDefenseBonus` into `buildCombatContextForDefender`**

```ts
// src/systems/combat-context.ts
import { resolveLastStandDefenseBonus } from './great-general-abilities';

// inside buildCombatContextForDefender, alongside the existing
// attackerSupplyPenalty/defenderSupplyPenalty computation:
const defenderLastStand = resolveLastStandDefenseBonus(defender, state.turn);

// in the returned object, alongside defenderLandSupplyMultiplier/Fact:
defenderLastStandMultiplier: defenderLastStand.multiplier,
defenderLastStandFact: defenderLastStand.label
  ? { key: 'last-stand', label: defenderLastStand.label, sourceVisibility: 'public', operation: 'multiplier', value: defenderLastStand.multiplier, outcome: 'applied' }
  : undefined,
```

(`sourceVisibility: 'public'` matches fortification's choice, not
`'owner'` like land-supply — Last Stand's defense bonus is a visible
battlefield effect the attacker should see forming up, same reasoning as
fortification being public.)

- [ ] **Step 8: Add the field to `CombatContext` and apply it in `calculateCombatStrengths`**

```ts
// src/systems/combat-system.ts:177-207 -- add alongside defenderFortificationMultiplier/Fact
defenderLastStandMultiplier?: number;
defenderLastStandFact?: CombatModifierFact;
```

```ts
// src/systems/combat-system.ts:287-345 -- add alongside the other defenderStrength *= lines
defenderStrength *= context?.defenderLastStandMultiplier ?? 1;
```

- [ ] **Step 9: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-system.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/systems/great-general-abilities.ts src/systems/combat-context.ts src/systems/combat-system.ts tests/systems/great-general-abilities.test.ts tests/systems/combat-system.test.ts
git commit -m "feat(#544): MR4 Task 7 — Last Stand eligibility, issuance, and defense bonus"
```

---

### Task 8: Last Stand's Hold save inside `applyCombatOutcomeToState`

**Files:**
- Modify: `src/systems/combat-reward-system.ts:345-583` (`applyCombatOutcomeToState`)
- Test: `tests/systems/combat-reward-system.test.ts`

**Interfaces:**
- Consumes: `consumeLastStandHoldFormationWide` (Task 7, `great-general-abilities.ts`).
- Produces: no new exports — `applyCombatOutcomeToState`'s existing
  signature and `CombatOutcomeApplication` return type are unchanged; only
  its internal branching grows.

This is the highest-risk task in the plan: three separate lethal-resolution
sites inside one large function (attacker branch ~line 403, defender branch
~line 496, splash-hit loop ~line 566-583), and the existing `geneTherapyReady`
precedent only covers the first two. Contract §27 requires Last Stand's Hold
save to cover all three (splash = "bombardment," one of the contract's
explicitly named protected damage sources).

- [ ] **Step 1: Write the failing test for the attacker-side Hold save**

```ts
// tests/systems/combat-reward-system.test.ts (append, using this file's
// existing applyCombatOutcomeToState fixture-building convention -- read
// the top of the file for how attacker/defender/result are already built
// for the geneTherapyReady tests and mirror that exactly)
describe('#544 MR4 — Last Stand Hold save', () => {
  it('an attacker with an unexpired lastStandHold survives a lethal result at 1 HP and consumes the hold', () => {
    const { state, result } = /* existing lethal-attacker fixture, result.attackerSurvived = false */;
    const hold = { formationId: 'f1', defenseBonusMultiplier: 1.15, expiresTurn: state.turn + 1 };
    state.units[result.attackerId] = { ...state.units[result.attackerId], lastStandHold: hold };

    const application = applyCombatOutcomeToState(state, result, 1);
    expect(application.attackerDefeated).toBe(false);
    expect(application.state.units[result.attackerId].health).toBe(1);
    expect(application.state.units[result.attackerId].lastStandHold).toBeUndefined();
  });

  it('a defender with an unexpired lastStandHold survives a lethal result at 1 HP and consumes the hold', () => {
    const { state, result } = /* existing lethal-defender fixture, result.defenderSurvived = false */;
    const hold = { formationId: 'f2', defenseBonusMultiplier: 1.15, expiresTurn: state.turn + 1 };
    state.units[result.defenderId] = { ...state.units[result.defenderId], lastStandHold: hold };

    const application = applyCombatOutcomeToState(state, result, 1);
    expect(application.defenderDefeated).toBe(false);
    expect(application.state.units[result.defenderId].health).toBe(1);
  });

  it('an EXPIRED lastStandHold does not save the unit', () => {
    const { state, result } = /* existing lethal-attacker fixture */;
    const hold = { formationId: 'f3', defenseBonusMultiplier: 1.15, expiresTurn: state.turn - 1 };
    state.units[result.attackerId] = { ...state.units[result.attackerId], lastStandHold: hold };

    const application = applyCombatOutcomeToState(state, result, 1);
    expect(application.attackerDefeated).toBe(true);
  });

  it('the save is consumed formation-wide: a second unit sharing the formationId loses its hold too, even though it was not the one hit', () => {
    const { state, result } = /* existing lethal-attacker fixture */;
    const hold = { formationId: 'shared-formation', defenseBonusMultiplier: 1.15, expiresTurn: state.turn + 1 };
    state.units[result.attackerId] = { ...state.units[result.attackerId], lastStandHold: hold };
    state.units['bystander-1'] = { ...state.units[result.defenderId], id: 'bystander-1', lastStandHold: hold };

    const application = applyCombatOutcomeToState(state, result, 1);
    expect(application.state.units['bystander-1'].lastStandHold).toBeUndefined();
  });

  it('splash damage also honors an unexpired lastStandHold (contract §27: protects against bombardment)', () => {
    const { state, result } = /* existing splash-hit fixture -- a splashHits entry whose damage would be lethal to a bystander unit */;
    const hold = { formationId: 'f4', defenseBonusMultiplier: 1.15, expiresTurn: state.turn + 1 };
    const splashTargetId = result.splashHits![0].unitId;
    state.units[splashTargetId] = { ...state.units[splashTargetId], lastStandHold: hold };

    const application = applyCombatOutcomeToState(state, result, 1);
    expect(application.state.units[splashTargetId]).toBeDefined();
    expect(application.state.units[splashTargetId].health).toBe(1);
  });

  it('geneTherapyReady still takes precedence when both flags are somehow present (pre-existing mechanism checked first, unchanged ordering)', () => {
    const { state, result } = /* existing lethal-attacker fixture */;
    state.units[result.attackerId] = {
      ...state.units[result.attackerId],
      geneTherapyReady: true,
      lastStandHold: { formationId: 'f5', defenseBonusMultiplier: 1.15, expiresTurn: state.turn + 1 },
    };
    const application = applyCombatOutcomeToState(state, result, 1);
    // geneTherapyReady's own branch fires and consumes ITSELF, leaving lastStandHold untouched (not this MR's concern to change that ordering)
    expect(application.state.units[result.attackerId].geneTherapyReady).toBe(false);
    expect(application.state.units[result.attackerId].lastStandHold).toBeDefined();
  });

  it('review addition: the Hold save also pre-empts naval prize-capture -- a defeated attacker under Last Stand survives at 1 HP under its ORIGINAL owner instead of being captured by the enemy', () => {
    // Reuse this file's existing prize-crew/naval-capture fixture (the one
    // covering isCapturableNavalMilitary), but with the losing attacker
    // additionally holding an unexpired lastStandHold.
    const { state, result } = /* existing naval prize-capture fixture -- defenderSurvived: true, attacker is capturable naval military, meets the capture margin */;
    state.units[result.attackerId] = {
      ...state.units[result.attackerId],
      lastStandHold: { formationId: 'f6', defenseBonusMultiplier: 1.15, expiresTurn: state.turn + 1 },
    };
    const application = applyCombatOutcomeToState(state, result, 1);
    expect(application.attackerCaptured).toBe(false); // not captured...
    expect(application.attackerDefeated).toBe(false); // ...survived instead, at 1 HP, under its own owner
    expect(application.state.units[result.attackerId].owner).toBe(state.units[result.attackerId].owner);
    expect(application.state.units[result.attackerId].health).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-reward-system.test.ts`
Expected: FAIL — `application.attackerDefeated` is `true` (no Hold-save branch exists yet).

- [ ] **Step 3: Add a local helper and wire it into all three sites**

```ts
// src/systems/combat-reward-system.ts, near destroyEscortedGeneralAtPosition
import { consumeLastStandHoldFormationWide } from '@/systems/great-general-abilities';

/**
 * #544 MR4 contract §20/§27: the canonical Last Stand Hold-save check,
 * shared by all three lethal-resolution sites in this function (attacker
 * branch, defender branch, splash loop) so "one canonical resolution hook"
 * is literally true rather than three hand-rolled copies. Mirrors
 * geneTherapyReady's existing shape: check flag (and expiry) -> survive at
 * 1 HP -> consume. The one difference from geneTherapyReady is that
 * consumption is formation-wide, not just on the saved unit itself.
 */
function checkLastStandHold(unitBefore: Unit, currentTurn: number): boolean {
  const hold = unitBefore.lastStandHold;
  return hold !== undefined && currentTurn <= hold.expiresTurn;
}
```

Attacker branch (~line 403), add a new `else if` between the existing
`geneTherapyReady` branch and the civilian-capture branch. **Placement note
(review addition):** because this branch is checked before the civilian-
capture and naval-prize-capture branches below it, a defeated unit that
would otherwise be *captured* by the enemy (civilian capture or naval prize
crew) and that also holds an unexpired Last Stand Hold instead *survives at
1 HP under its own original owner* -- the Hold save wins over capture. This
is a deliberate, reasonable reading of "protects involuntary lethal damage"
(a captured unit doesn't die, but losing it to the enemy is arguably a worse
outcome for the player than surviving battered but still theirs), not an
oversight; a test below locks it in explicitly so it can't silently flip if
someone reorders these branches later.

```ts
  } else if (attackerBefore.geneTherapyReady === true) {
    // ...existing branch, unchanged...
    attackerActuallyDefeated = false;
  } else if (checkLastStandHold(attackerBefore, state.turn)) {
    units[result.attackerId] = {
      ...attackerBefore,
      health: 1,
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
      ...submarineRevealPatch(attackerBefore.type),
    };
    units = consumeLastStandHoldFormationWide(units, attackerBefore.lastStandHold!.formationId);
    attackerActuallyDefeated = false;
  } else if (
```

Defender branch (~line 496), the exact mirror:

```ts
  } else if (defenderBefore.geneTherapyReady === true) {
    // ...existing branch, unchanged...
    defenderActuallyDefeated = false;
  } else if (checkLastStandHold(defenderBefore, state.turn)) {
    units[result.defenderId] = {
      ...defenderBefore,
      health: 1,
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
    };
    units = consumeLastStandHoldFormationWide(units, defenderBefore.lastStandHold!.formationId);
    defenderActuallyDefeated = false;
  } else if (
```

Splash loop (~line 566-583) — this one has no `geneTherapyReady` precedent
at all today (a pre-existing gap, out of scope to fix here per Global
Constraints), so Last Stand is this loop's *first* lethal-survival check:

```ts
  const splashHits = result.splashHits ?? resolveBoundedSplash(state, attackerBefore, defenderBefore, result.defenderDamage);
  for (const hit of splashHits) {
    const target = units[hit.unitId];
    if (!target || hit.damage <= 0) continue;
    if (target.health > hit.damage) {
      units[hit.unitId] = { ...target, health: target.health - hit.damage };
      continue;
    }
    // #544 MR4 contract §27: Last Stand protects against "bombardment" --
    // splash is this codebase's bombardment-adjacent lethal-damage path, so
    // it must honor the hold too, even though geneTherapyReady historically
    // never did (that's a separate, pre-existing gap, not extended here).
    if (checkLastStandHold(target, state.turn)) {
      units[hit.unitId] = { ...target, health: 1 };
      units = consumeLastStandHoldFormationWide(units, target.lastStandHold!.formationId);
      continue;
    }
    defeatedUnitIds.add(hit.unitId);
    const removed = removeUnitFromCopies(units, civilizations, espionage, hit.unitId);
    units = removed.units;
    civilizations = removed.civilizations;
    espionage = removed.espionage;
    const escortCascade = destroyEscortedGeneralAtPosition(units, civilizations, espionage, target.position, target.owner);
    units = escortCascade.units;
    civilizations = escortCascade.civilizations;
    espionage = escortCascade.espionage;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-reward-system.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full combat/general test suite to confirm no MR1-MR3 regressions**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-reward-system.test.ts tests/systems/great-general-abilities.test.ts tests/systems/great-general-mr3-invariants.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/combat-reward-system.ts tests/systems/combat-reward-system.test.ts
git commit -m "feat(#544): MR4 Task 8 — Last Stand Hold save in applyCombatOutcomeToState"
```

---

### Task 9: Final Command retirement, and enriched General history

**Files:**
- Modify: `src/systems/great-general-system.ts`
- Modify: `src/systems/combat-reward-system.ts:322-343` (`recordGeneralDeaths`)
- Modify: `src/core/turn-manager.ts` (per-civ end-of-round loop)
- Modify: `src/core/types.ts` (`EventBus` gains `'general:retired'`)
- Modify: `src/presentation/register-general-presentation.ts` (retirement
  notification handler — review fix, see Step 3)
- Test: `tests/systems/great-general-system.test.ts`, `tests/systems/combat-reward-system.test.ts`, `tests/core/turn-manager.test.ts`

**Interfaces:**
- Consumes: `GENERAL_DEFINITIONS` (Task 1); `Unit.generalCommandChargesUsed`
  (Task 1); `GeneralHistoryEntry.outcome`/`retiredTurn`/`endOfCareerLine`/
  `heroicCommandsUsed` (Task 1).
- Produces: `describeGeneralCareerEnd(definition, outcome): string`;
  `retireGeneralsAtTurnEnd(state, civId, bus?): GameState`; the
  `'general:retired'` bus event. `recordGeneralDeaths`
  keeps its existing signature but now writes the enriched fields too.

Retirement needs no new transient flag: contract §21's "resolves normally,
remains for rest of owner turn, retires at end of turn" is naturally
satisfied by checking `generalCommandChargesUsed >= maxCommandCharges`
directly inside the existing per-civ end-of-round processing (the General
physically stays on the map, stabilization aura and all, for the remainder
of that live turn — nothing removes it until this end-of-round check runs).

- [ ] **Step 1: Write the failing test for `describeGeneralCareerEnd` and `retireGeneralsAtTurnEnd`**

```ts
// tests/systems/great-general-system.test.ts (append)
import { describeGeneralCareerEnd, retireGeneralsAtTurnEnd } from '@/systems/great-general-system';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

describe('describeGeneralCareerEnd', () => {
  it('returns a non-empty line naming the General for each outcome', () => {
    const def = GENERAL_DEFINITIONS[0];
    expect(describeGeneralCareerEnd(def, 'died')).toContain(def.name);
    expect(describeGeneralCareerEnd(def, 'retired')).toContain(def.name);
    expect(describeGeneralCareerEnd(def, 'died')).not.toBe(describeGeneralCareerEnd(def, 'retired'));
  });
});

describe('#544 MR4 — retireGeneralsAtTurnEnd', () => {
  function setup(chargesUsed: number) {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'retire-1' });
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', generalCommandChargesUsed: chargesUsed,
    } as Unit;
    state.civilizations.player.units = ['gen-1'];
    state.civilizations.player.generalHistory = [{ unitId: 'gen-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 1 }];
    return state;
  }

  it('removes the General once all charges are used', () => {
    const result = retireGeneralsAtTurnEnd(setup(3), 'player');
    expect(result.units['gen-1']).toBeUndefined();
    expect(result.civilizations.player.units).not.toContain('gen-1');
  });

  it('leaves a General with charges remaining untouched', () => {
    const result = retireGeneralsAtTurnEnd(setup(2), 'player');
    expect(result.units['gen-1']).toBeDefined();
  });

  it('writes outcome, retiredTurn, endOfCareerLine, and heroicCommandsUsed to generalHistory', () => {
    const state = { ...setup(3), turn: 7 };
    const result = retireGeneralsAtTurnEnd(state, 'player');
    const entry = result.civilizations.player.generalHistory!.find(e => e.unitId === 'gen-1')!;
    expect(entry.outcome).toBe('retired');
    expect(entry.retiredTurn).toBe(7);
    expect(entry.endOfCareerLine).toBeTruthy();
    expect(entry.heroicCommandsUsed).toBe(3);
  });

  it('is a no-op for a civ with no Generals', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'retire-2' });
    expect(retireGeneralsAtTurnEnd(state, 'player')).toBe(state);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: FAIL — `describeGeneralCareerEnd`/`retireGeneralsAtTurnEnd` not exported.

- [ ] **Step 3: Write the implementation**

```ts
// src/systems/great-general-system.ts (append)
import type { EventBus } from '@/core/event-bus';

/**
 * #544 MR4 contract §23: "one concise end-of-career line." V1 deliberately
 * uses a generic, definition-name-flavored line rather than reconstructing
 * battle/city context -- the contract's own examples ("Fell defending
 * Athens") imply richer narrative context this MR has no cheap access to at
 * either call site (mid-combat-resolution for death, end-of-round for
 * retirement). Documented scope reduction: contract §33's "rich Great
 * General biographies" (issue E) is the explicit deferred richer-narrative
 * follow-up this defers to.
 */
export function describeGeneralCareerEnd(definition: Pick<GeneralDefinition, 'name'>, outcome: 'retired' | 'died'): string {
  return outcome === 'died'
    ? `${definition.name} fell in battle.`
    : `${definition.name} retired after a distinguished career.`;
}

/**
 * #544 MR4 contract §21: the 3rd lifetime charge "resolves normally... no
 * mechanical bonus... General remains for rest of owner turn... retires at
 * end of turn." No transient flag is needed -- generalCommandChargesUsed
 * reaching maxCommandCharges IS the retirement condition, checked once per
 * civ per round in turn-manager.ts's existing end-of-round per-civ loop
 * (Step 6 below), after the General has already acted normally for the
 * whole turn.
 */
export function retireGeneralsAtTurnEnd(state: GameState, civId: string, bus?: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  const retiring = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u) && u.type === 'great_general')
    .filter(u => {
      const definition = GENERAL_DEFINITIONS.find(g => g.id === u.generalDefinitionId);
      return definition && (u.generalCommandChargesUsed ?? 0) >= definition.maxCommandCharges;
    });
  if (retiring.length === 0) return state;

  let units = { ...state.units };
  let civUnits = civ.units;
  let generalHistory = civ.generalHistory ?? [];
  for (const general of retiring) {
    const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId)!;
    const endOfCareerLine = describeGeneralCareerEnd(definition, 'retired');
    delete units[general.id];
    civUnits = civUnits.filter(id => id !== general.id);
    generalHistory = generalHistory.map(entry =>
      entry.unitId === general.id
        ? {
            ...entry,
            outcome: 'retired' as const,
            retiredTurn: state.turn,
            endOfCareerLine,
            heroicCommandsUsed: general.generalCommandChargesUsed ?? 0,
          }
        : entry,
    );
    // #544 MR4 review fix: unlike death (visible through the combat flow
    // that caused it), retirement happens silently during end-of-round
    // processing -- the player confirmed Final Command earlier in their own
    // turn, but the General doesn't actually vanish until this later,
    // asynchronous point. Without this, a player would open their unit list
    // next turn and find a General simply gone with no explanation. Mirrors
    // the optional-bus, emit-if-present convention already used by
    // `beginConfirmedForeignCityEntry`'s `diplomacy:war-declared` emit.
    bus?.emit('general:retired', { civId, generalName: definition.name, message: endOfCareerLine });
  }

  return {
    ...state,
    units,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, units: civUnits, generalHistory },
    },
  };
}
```

**Review fix — this event needs three more pieces to actually reach the
player**, following this codebase's established event → registrar →
`notification-delivery` pipeline (never call `notification-delivery`
directly from a `src/systems/*.ts` file — it's a controller/UI-layer
concern, confirmed by grep: no `src/systems/*.ts` file imports it today):

1. Add the event to `EventBus`'s type map in `src/core/types.ts`, alongside
   `'diplomacy:war-declared'`/`'unit:obsolete'` (~line 2239-2334):

```ts
'general:retired': { civId: string; generalName: string; message: string };
```

2. Add a handler in `src/presentation/register-general-presentation.ts`
   (this file's own docblock already describes itself as "a bucket for
   events that don't cleanly fit any of the other domain registrars" — this
   is the first genuine Great-General event to land there; the naming
   overlap with the "Great General" game feature is coincidental, worth a
   comment so a future reader isn't confused):

```ts
bus.on('general:retired', ({ civId, generalName, message }) => {
  ctx.notifier.deliver(civId, `${generalName} has retired. ${message}`, 'info');
}),
```

3. Thread `bus` through the call site added in Step 11 below
   (`turn-manager.ts` already has `bus` in scope in this exact function —
   the `bus.emit('tech:completed', ...)` call earlier in the same per-civ
   loop is the proof).

Add a test confirming the event fires:

```ts
// tests/systems/great-general-system.test.ts (append to the
// retireGeneralsAtTurnEnd describe block)
it('#544 MR4 review fix: emits general:retired with the General\'s name when bus is provided', () => {
  const state = { ...setup(3), turn: 7 };
  const emit = vi.fn();
  retireGeneralsAtTurnEnd(state, 'player', { emit } as unknown as EventBus);
  expect(emit).toHaveBeenCalledWith('general:retired', expect.objectContaining({
    civId: 'player',
    generalName: expect.any(String),
  }));
});

it('#544 MR4 review fix: is safe to call with no bus at all (bus is optional)', () => {
  const state = { ...setup(3), turn: 7 };
  expect(() => retireGeneralsAtTurnEnd(state, 'player')).not.toThrow();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test enriching `recordGeneralDeaths`**

```ts
// tests/systems/combat-reward-system.test.ts (append, near the existing
// recordGeneralDeaths / destroyEscortedGeneralAtPosition coverage)
it('#544 MR4: a General killed in combat gets outcome, endOfCareerLine, and heroicCommandsUsed recorded', () => {
  const { state, result } = /* existing fixture that kills a great_general unit -- reuse the escort-death fixture already used for MR3's death tests */;
  const beforeUnits = { ...state.units };
  state.units[/* general id */] = { ...state.units[/* general id */], generalCommandChargesUsed: 1 };
  const application = applyCombatOutcomeToState(state, result, 1);
  const entry = application.state.civilizations['player'].generalHistory!.find(e => e.unitId === /* general id */)!;
  expect(entry.outcome).toBe('died');
  expect(entry.endOfCareerLine).toBeTruthy();
  expect(entry.heroicCommandsUsed).toBe(1);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-reward-system.test.ts`
Expected: FAIL — `entry.outcome` is `undefined`.

- [ ] **Step 7: Extend `recordGeneralDeaths`**

```ts
// src/systems/combat-reward-system.ts:322-343
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { describeGeneralCareerEnd } from '@/systems/great-general-system';

function recordGeneralDeaths(beforeUnits: Record<string, Unit>, state: GameState): GameState {
  const deadGenerals = Object.values(beforeUnits).filter(
    u => u.type === 'great_general' && !state.units[u.id],
  );
  if (deadGenerals.length === 0) return state;

  let civilizations = state.civilizations;
  for (const general of deadGenerals) {
    const civ = civilizations[general.owner];
    if (!civ?.generalHistory) continue;
    const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
    civilizations = {
      ...civilizations,
      [general.owner]: {
        ...civ,
        generalHistory: civ.generalHistory.map(entry =>
          entry.unitId === general.id
            ? {
                ...entry,
                diedTurn: state.turn,
                outcome: 'died' as const,
                endOfCareerLine: definition ? describeGeneralCareerEnd(definition, 'died') : undefined,
                heroicCommandsUsed: general.generalCommandChargesUsed ?? 0,
              }
            : entry,
        ),
      },
    };
  }
  return { ...state, civilizations };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-reward-system.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing integration test wiring `retireGeneralsAtTurnEnd` into `processTurn`**

```ts
// tests/core/turn-manager.test.ts (append, using this file's existing
// processTurn fixture-building convention)
it('#544 MR4: a General who spent all 3 charges is retired during end-of-round processing', () => {
  const state = /* existing minimal-civ fixture already used by this file */;
  state.units['gen-1'] = {
    id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    generalDefinitionId: 'gen_caesar', generalCommandChargesUsed: 3,
  } as Unit;
  state.civilizations.player.units.push('gen-1');
  state.civilizations.player.generalHistory = [{ unitId: 'gen-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 1 }];

  const result = processTurn(state, /* existing bus/deps arg this file already passes */);
  expect(result.units['gen-1']).toBeUndefined();
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/turn-manager.test.ts`
Expected: FAIL — the General is still present after `processTurn`.

- [ ] **Step 11: Wire `retireGeneralsAtTurnEnd` into the per-civ loop**

In `src/core/turn-manager.ts`, right before the existing "Reset unit
movement" `resetUnitTurn` loop (~line 661-662, immediately after the
healing loop and the `applyGeneTherapyRecharge` call):

```ts
import { retireGeneralsAtTurnEnd } from '@/systems/great-general-system';

// ...
    // Reset geneTherapyReady cooldown for units that rested a full turn in a friendly city
    newState = applyGeneTherapyRecharge(newState, civId, unitIdsAtTurnStart);

    // #544 MR4 contract §21: retire any General who has spent all 3
    // Command Charges, before resetting movement for this civ's remaining
    // units -- the General "remains for rest of owner turn" (already true,
    // nothing removed it earlier this round) and "retires at end of turn"
    // (this is that end-of-turn point). `bus` passed through so the
    // retirement notification (review fix, see above) actually reaches the
    // player -- this function already has `bus` in scope in this exact
    // per-civ loop (see the `bus.emit('tech:completed', ...)` call earlier
    // in the same loop).
    newState = retireGeneralsAtTurnEnd(newState, civId, bus);

    // Reset unit movement
    for (const unitId of civ.units) {
```

Note `civ` here is the loop's per-civ snapshot captured before this point —
`retireGeneralsAtTurnEnd` reads `newState.civilizations[civId]` internally
via its own parameter, so it doesn't matter that the outer `civ.units` array
still contains the now-retired General's id for the rest of this iteration;
the subsequent `resetUnitTurn` loop's `newState.units[unitId]` lookup will
simply be `undefined` for that id and its `if (unit)` guard already skips it
safely (same pattern already used for units removed earlier in this same loop).

- [ ] **Step 12: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/turn-manager.test.ts`
Expected: PASS

- [ ] **Step 13: Run the full general/combat/turn-manager suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts tests/systems/combat-reward-system.test.ts tests/core/turn-manager.test.ts`
Expected: All PASS.

- [ ] **Step 14: Commit**

```bash
git add src/systems/great-general-system.ts src/systems/combat-reward-system.ts src/core/turn-manager.ts src/core/types.ts src/presentation/register-general-presentation.ts tests/systems/great-general-system.test.ts tests/systems/combat-reward-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(#544): MR4 Task 9 — Final Command retirement and enriched General history"
```

---

### Task 10: General command panel — exact stats and ability buttons

**Files:**
- Modify: `src/ui/selected-unit-info.ts:342-370` (the existing `great_general` block)
- Test: `tests/ui/selected-unit-info.test.ts`

**Interfaces:**
- Consumes: `getHeroicCommandEligibility` (Task 3); `getEffectiveCommandStats`
  (MR3); `GENERAL_DEFINITIONS` (Task 1).
- Produces: `SelectedUnitInfoCallbacks` gains `onOpenRally?: (generalUnitId: string) => void`,
  `onOpenSeize?: (generalUnitId: string) => void`,
  `onStartLastStandTargeting?: (generalUnitId: string) => void`. Task 11/12's
  controller wiring supplies these.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/selected-unit-info.test.ts (append, using this file's existing
// renderSelectedUnitInfo fixture-building convention for a great_general unit)
describe('#544 MR4 — General command panel', () => {
  it('shows exact command range, capacity, charges, and cooldown', () => {
    const { container, state } = /* existing great_general fixture from MR3's coverage in this file */;
    state.units['gen-1'].generalCommandChargesUsed = 1;
    renderSelectedUnitInfo(container, state, 'gen-1', {});
    const text = container.textContent ?? '';
    expect(text).toMatch(/2\s*\/\s*3/); // 2 charges remaining of 3
    expect(text).toMatch(/command range/i);
    expect(text).toMatch(/command capacity/i);
  });

  it('renders three ability buttons: Rally, Seize the Moment, Last Stand', () => {
    const { container, state } = /* existing fixture */;
    renderSelectedUnitInfo(container, state, 'gen-1', {});
    expect(container.textContent).toMatch(/Rally/);
    expect(container.textContent).toMatch(/Seize the Moment/);
    expect(container.textContent).toMatch(/Last Stand/);
  });

  it('disables ability buttons when the General is ineligible (e.g. spawn-turn restriction)', () => {
    const { container, state } = /* existing fixture */;
    state.units['gen-1'].generalNoCommandThisTurn = true;
    renderSelectedUnitInfo(container, state, 'gen-1', {});
    const buttons = Array.from(container.querySelectorAll('button')).filter(b =>
      /Rally|Seize the Moment|Last Stand/.test(b.textContent ?? ''));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.disabled).toBe(true);
  });

  it('clicking Rally invokes onOpenRally with the General\'s unit id', () => {
    const { container, state } = /* existing fixture */;
    const onOpenRally = vi.fn();
    renderSelectedUnitInfo(container, state, 'gen-1', { onOpenRally });
    const rallyButton = Array.from(container.querySelectorAll('button')).find(b => /^Rally/.test(b.textContent ?? ''))!;
    rallyButton.click();
    expect(onOpenRally).toHaveBeenCalledWith('gen-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/selected-unit-info.test.ts`
Expected: FAIL — no ability buttons exist yet, `text` doesn't match `/2\s*\/\s*3/`.

- [ ] **Step 3: Extend the callbacks interface and the `great_general` render block**

```ts
// src/ui/selected-unit-info.ts -- add to SelectedUnitInfoCallbacks (near onReopenSupplyTutorial)
/** #544 MR4: opens the Rally auto-preview/confirm panel. */
onOpenRally?: (generalUnitId: string) => void;
/** #544 MR4: opens the Seize the Moment eligible-unit picker. */
onOpenSeize?: (generalUnitId: string) => void;
/** #544 MR4: begins Last Stand's hex-targeting mode. */
onStartLastStandTargeting?: (generalUnitId: string) => void;
```

Extend the existing block at line 342 (`if (unit.type === 'great_general' && unit.generalDefinitionId)`):

```ts
import { getHeroicCommandEligibility } from '@/systems/great-general-system';
import { getEffectiveCommandStats } from '@/systems/great-general-system';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';

// ...inside the existing great_general block, after the existing identity rendering:
const eligibility = getHeroicCommandEligibility(state, unit);
const { commandRange, commandCapacity } = getEffectiveCommandStats(unit, generalDef);

const statsLine = document.createElement('div');
statsLine.style.cssText = 'font-size:12px;opacity:0.85;margin:6px 0;';
statsLine.append(
  document.createTextNode(
    `Command range ${commandRange} · Command capacity ${commandCapacity} · `
    // #544 MR4 review fix: reuse the `generalDef` binding this block already
    // computed for the identity display above (`GENERAL_DEFINITIONS.find(...)`
    // re-run here was a needless duplicate lookup of the exact same value).
    + `Charges ${eligibility.chargesRemaining}/${generalDef.maxCommandCharges}`
    + (eligibility.cooldownTurnsRemaining > 0 ? ` · Cooldown ${eligibility.cooldownTurnsRemaining} turn(s)` : ''),
  ),
);
container.appendChild(statsLine);

if (!eligibility.eligible && eligibility.reason) {
  const reasonLine = document.createElement('div');
  reasonLine.textContent = eligibility.reason;
  reasonLine.style.cssText = 'font-size:11px;opacity:0.7;margin-bottom:6px;';
  container.appendChild(reasonLine);
}

const abilityRow = document.createElement('div');
abilityRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;';

const rallyButton = createGameButton(
  eligibility.isFinalCharge ? 'Rally (Final Command)' : 'Rally',
  'secondary',
  { disabled: !eligibility.eligible },
);
rallyButton.addEventListener('click', () => callbacks.onOpenRally?.(unit.id));
abilityRow.appendChild(rallyButton);

const seizeButton = createGameButton(
  eligibility.isFinalCharge ? 'Seize the Moment (Final Command)' : 'Seize the Moment',
  'secondary',
  { disabled: !eligibility.eligible },
);
seizeButton.addEventListener('click', () => callbacks.onOpenSeize?.(unit.id));
abilityRow.appendChild(seizeButton);

const lastStandButton = createGameButton(
  eligibility.isFinalCharge ? 'Last Stand (Final Command)' : 'Last Stand',
  'secondary',
  { disabled: !eligibility.eligible },
);
lastStandButton.addEventListener('click', () => callbacks.onStartLastStandTargeting?.(unit.id));
abilityRow.appendChild(lastStandButton);

container.appendChild(abilityRow);
```

(`generalDef` is the existing `GENERAL_DEFINITIONS.find(...)` result the
block already computes at line 343 for the identity display — reuse that
binding rather than re-finding it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/selected-unit-info.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/selected-unit-info.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(#544): MR4 Task 10 — General command panel stats and ability buttons"
```

---

### Task 11: Rally and Seize the Moment confirmation panels

**Files:**
- Create: `src/ui/general-command-panel.ts`
- Modify: `src/app/controllers/selection-controller.ts` (wiring)
- Test: `tests/ui/general-command-panel.test.ts`

**Interfaces:**
- Consumes: `getRallyPreview`/`issueRally`, `getSeizeTheMomentEligibleUnits`/
  `issueSeizeTheMoment` (Tasks 5, 6); `createGameButton` (`ui-kit.ts`).
- Produces: `createRallyPanel(container, preview, onConfirm, onCancel): HTMLElement`;
  `createSeizeThePanelMoment(container, generalUnitId, eligible, onConfirm, onCancel): HTMLElement`
  (Task 12 adds the Last Stand and Final Command panels to this same file).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/general-command-panel.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createRallyPanel, createSeizeThePanelMoment } from '@/ui/general-command-panel';
import type { RallyPreview } from '@/systems/great-general-abilities';

describe('createRallyPanel', () => {
  function makePreview(): RallyPreview {
    return {
      eligibility: { eligible: true, chargesRemaining: 2, isFinalCharge: false, cooldownTurnsRemaining: 0 },
      targets: [{ unitId: 'unit-1', healthBefore: 40, healthAfter: 70, stageBefore: 'severe', stageAfter: 'degraded' }],
    };
  }

  it('renders each target\'s HP and stage change', () => {
    const container = document.createElement('div');
    createRallyPanel(container, makePreview(), () => {}, () => {});
    const text = container.textContent ?? '';
    expect(text).toMatch(/40/);
    expect(text).toMatch(/70/);
    expect(text).toMatch(/severe/i);
    expect(text).toMatch(/degraded/i);
  });

  it('confirm button invokes onConfirm exactly once', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createRallyPanel(container, makePreview(), onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel button invokes onCancel and does not invoke onConfirm', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    createRallyPanel(container, makePreview(), onConfirm, onCancel);
    const cancelButton = Array.from(container.querySelectorAll('button')).find(b => /cancel/i.test(b.textContent ?? ''))!;
    cancelButton.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a Final Command warning when eligibility.isFinalCharge is true', () => {
    const container = document.createElement('div');
    const preview = { ...makePreview(), eligibility: { ...makePreview().eligibility, isFinalCharge: true } };
    createRallyPanel(container, preview, () => {}, () => {});
    expect(container.textContent).toMatch(/final command/i);
    expect(container.textContent).toMatch(/retire/i);
  });

  it('review fix: disables Confirm when there are zero targets, so a charge can never be spent on a no-op', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createRallyPanel(container, { ...makePreview(), targets: [] }, onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    confirmButton.click();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('createSeizeThePanelMoment', () => {
  it('renders a checkbox per eligible unit', () => {
    const container = document.createElement('div');
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior' }, { unitId: 'unit-2', label: 'archer' }], () => {}, () => {});
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(2);
  });

  it('confirm passes only the checked unit ids', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior' }, { unitId: 'unit-2', label: 'archer' }], onConfirm, () => {});
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event('change'));
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledWith(['unit-1']);
  });

  it('review fix: shows an empty-state message when zero units are eligible', () => {
    const container = document.createElement('div');
    createSeizeThePanelMoment(container, 'gen-1', [], () => {}, () => {});
    expect(container.textContent).toMatch(/no units|nothing eligible/i);
  });

  it('review fix: Confirm starts disabled and stays disabled until at least one checkbox is checked', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior' }], onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    confirmButton.click();
    expect(onConfirm).not.toHaveBeenCalled();

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(confirmButton.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/general-command-panel.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Mirror `general-candidate-panel.ts`'s full-screen-overlay structure exactly
(same `position:absolute;inset:0` panel shell, same `createGameButton`
usage, same single-fire guard pattern):

```ts
// src/ui/general-command-panel.ts
import type { RallyPreview, SeizeEligibleUnit } from '@/systems/great-general-abilities';
import { createGameButton, setButtonDisabled } from '@/ui/ui-kit';

function panelShell(container: HTMLElement, id: string): HTMLElement {
  container.querySelector(`#${id}`)?.remove();
  const panel = document.createElement('div');
  panel.id = id;
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:50;padding:16px;overflow:auto;';
  container.appendChild(panel);
  return panel;
}

function finalCommandNotice(panel: HTMLElement): void {
  const notice = document.createElement('p');
  notice.textContent = 'Final Command: this is this General\'s last Command Charge. They will retire at the end of this turn.';
  notice.style.cssText = 'font-size:12px;color:#e8c170;font-weight:bold;margin:8px 0;';
  panel.appendChild(notice);
}

/** `disableConfirm` (review fix): true when there is nothing for Confirm to
 * actually do (e.g. Rally/Last Stand previewed zero eligible targets) --
 * disabling it here is UI-layer defense-in-depth alongside the state-layer
 * guards in issueRally/issueSeizeTheMoment/issueLastStand that already
 * refuse to spend a charge on a no-op; this just stops the player from
 * clicking a Confirm that both know will do nothing. */
function confirmCancelRow(panel: HTMLElement, onConfirm: () => void, onCancel: () => void, disableConfirm = false): void {
  let fired = false;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:12px;';

  const confirmButton = createGameButton('Confirm', 'primary', { disabled: disableConfirm });
  confirmButton.addEventListener('click', () => {
    if (fired || disableConfirm) return;
    fired = true;
    panel.remove();
    onConfirm();
  });
  row.appendChild(confirmButton);

  const cancelButton = createGameButton('Cancel', 'ghost');
  cancelButton.addEventListener('click', () => {
    if (fired) return;
    fired = true;
    panel.remove();
    onCancel();
  });
  row.appendChild(cancelButton);

  panel.appendChild(row);
}

export function createRallyPanel(
  container: HTMLElement,
  preview: RallyPreview,
  onConfirm: () => void,
  onCancel: () => void,
): HTMLElement {
  const panel = panelShell(container, 'rally-panel');

  const title = document.createElement('h2');
  title.textContent = 'Rally';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  panel.appendChild(title);

  if (preview.eligibility.isFinalCharge) finalCommandNotice(panel);

  if (preview.targets.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No units in range are eligible for Rally right now.';
    empty.style.cssText = 'font-size:13px;opacity:0.8;';
    panel.appendChild(empty);
  }

  for (const target of preview.targets) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:8px;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;font-size:12px;';
    row.textContent = `${target.unitId}: HP ${target.healthBefore} -> ${target.healthAfter}, ${target.stageBefore} -> ${target.stageAfter}`;
    panel.appendChild(row);
  }

  confirmCancelRow(panel, onConfirm, onCancel, preview.targets.length === 0);
  return panel;
}

export function createSeizeThePanelMoment(
  container: HTMLElement,
  generalUnitId: string,
  eligible: SeizeEligibleUnit[],
  onConfirm: (selectedUnitIds: string[]) => void,
  onCancel: () => void,
): HTMLElement {
  const panel = panelShell(container, 'seize-the-moment-panel');

  const title = document.createElement('h2');
  title.textContent = 'Seize the Moment';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  panel.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = 'Choose which units get one more action:';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 12px;';
  panel.appendChild(intro);

  // #544 MR4 review fix: Rally and Last Stand both already show an explicit
  // empty-state message when there's nothing to act on -- Seize had none,
  // leaving the player looking at a near-blank panel with no explanation.
  if (eligible.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No units nearby have already acted this turn -- nothing eligible for Seize the Moment yet.';
    empty.style.cssText = 'font-size:13px;opacity:0.8;';
    panel.appendChild(empty);
  }

  const checkboxes: HTMLInputElement[] = [];
  for (const entry of eligible) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.unitId = entry.unitId;
    checkboxes.push(checkbox);
    label.appendChild(checkbox);
    label.append(document.createTextNode(`${entry.label} (${entry.unitId})`));
    panel.appendChild(label);
  }

  let fired = false;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:12px;';

  // #544 MR4 review fix: same defense-in-depth as Rally/Last Stand -- start
  // disabled whenever there's nothing to select yet (no eligible units, or
  // none checked), and keep it in sync as the player toggles checkboxes, so
  // Confirm can never be clicked into a charge-spending no-op.
  const confirmButton = createGameButton('Confirm', 'primary', { disabled: checkboxes.every(cb => !cb.checked) });
  const syncConfirmDisabled = () => setButtonDisabled(confirmButton, checkboxes.every(cb => !cb.checked));
  for (const checkbox of checkboxes) checkbox.addEventListener('change', syncConfirmDisabled);
  confirmButton.addEventListener('click', () => {
    if (fired || checkboxes.every(cb => !cb.checked)) return;
    fired = true;
    const selected = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.unitId!);
    panel.remove();
    onConfirm(selected);
  });
  row.appendChild(confirmButton);

  const cancelButton = createGameButton('Cancel', 'ghost');
  cancelButton.addEventListener('click', () => {
    if (fired) return;
    fired = true;
    panel.remove();
    onCancel();
  });
  row.appendChild(cancelButton);

  panel.appendChild(row);
  return panel;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/general-command-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Wire Rally and Seize into the controller**

In `src/app/controllers/selection-controller.ts`, add alongside the existing
`onReopenSupplyTutorial` callback (~line 186):

```ts
import { createRallyPanel, createSeizeThePanelMoment } from '@/ui/general-command-panel';
import { getRallyPreview, issueRally, getSeizeTheMomentEligibleUnits, issueSeizeTheMoment } from '@/systems/great-general-abilities';

// ...inside the renderSelectedUnitInfo callbacks object:
onOpenRally: (generalUnitId: string) => {
  const preview = getRallyPreview(session.getState(), generalUnitId);
  createRallyPanel(
    deps.uiLayer,
    preview,
    () => {
      session.commit(issueRally(session.getState(), generalUnitId));
      selectUnit(generalUnitId); // refresh the panel so charges/cooldown reflect immediately
    },
    () => {},
  );
},
onOpenSeize: (generalUnitId: string) => {
  const { eligible } = getSeizeTheMomentEligibleUnits(session.getState(), generalUnitId);
  createSeizeThePanelMoment(
    deps.uiLayer,
    generalUnitId,
    eligible,
    (selectedUnitIds) => {
      session.commit(issueSeizeTheMoment(session.getState(), generalUnitId, selectedUnitIds));
      selectUnit(generalUnitId);
    },
    () => {},
  );
},
```

`deps.uiLayer` is `SelectionControllerDeps.uiLayer: HTMLElement` — already
threaded into this controller (used elsewhere in the file), the same DOM
layer `bootstrap.ts` mounts `createGeneralCandidatePanel` onto (as
`uiLayer`), so Rally/Seize mount into that identical overlay layer.

- [ ] **Step 6: Manual verification in the browser** (per this repo's UI
verification workflow — start the dev server, spawn/fast-forward to a
General via a dev console helper if one exists, or via a short scenario;
open its panel; click Rally and Seize; confirm the panels render and
Confirm/Cancel both work and refresh the unit panel.)

- [ ] **Step 7: Commit**

```bash
git add src/ui/general-command-panel.ts src/app/controllers/selection-controller.ts tests/ui/general-command-panel.test.ts
git commit -m "feat(#544): MR4 Task 11 — Rally and Seize the Moment confirmation panels"
```

---

### Task 12: Last Stand hex targeting and preview panel

**Files:**
- Modify: `src/app/ports.ts:66-70` (`PendingMapIntent`)
- Modify: `src/input/map-tap-intent.ts` (`resolveMapTapIntent`, `ResolvablePendingIntent`)
- Modify: `src/app/controllers/map-interaction-controller.ts:123-153` (`handleHexTap`'s `resolve-pending` switch)
- Modify: `src/app/controllers/selection-controller.ts` (`onStartLastStandTargeting`)
- Modify: `src/ui/general-command-panel.ts` (new `createLastStandPanel`)
- Test: `tests/input/map-tap-intent.test.ts`, `tests/ui/general-command-panel.test.ts`

**Interfaces:**
- Consumes: `getLastStandPreview`/`issueLastStand` (Task 7); `getEffectiveCommandStats`
  (MR3); `mapHexesInRange` (`hex-utils.ts`).
- Produces: `PendingMapIntent` gains `{ kind: 'last-stand-target'; unitId: string; range: readonly HexCoord[] }`;
  `createLastStandPanel(container, preview, onConfirm, onCancel): HTMLElement`.

Last Stand's target-hex selection reuses this codebase's existing
targeting-mode machinery exactly — the same `PendingMapIntent`/
`resolveMapTapIntent`/`handleHexTap` pipeline `unload` already uses for
"tap must land within a precomputed range or it's a mistap." This is a
richer integration than Rally/Seize (which need no map interaction at all)
but it is not new architecture — it is one more variant of a pattern this
codebase already has three examples of (`journey`, `unload`, `air-mission`).

- [ ] **Step 1: Write the failing test for the new `PendingMapIntent` variant's range check**

```ts
// tests/input/map-tap-intent.test.ts (append, using this file's existing
// resolveMapTapIntent fixture-building convention)
describe('#544 MR4 — last-stand-target pending intent', () => {
  it('resolves when the tap lands inside the precomputed range', () => {
    const state = /* existing minimal-state fixture */;
    const selection = { selectedUnitId: null, pendingIntent: { kind: 'last-stand-target', unitId: 'gen-1', range: [{ q: 1, r: 0 }] } };
    const result = resolveMapTapIntent(state, selection, { q: 1, r: 0 }, false);
    expect(result.kind).toBe('resolve-pending');
  });

  it('is a mistap when the tap lands outside the precomputed range', () => {
    const state = /* existing minimal-state fixture */;
    const selection = { selectedUnitId: null, pendingIntent: { kind: 'last-stand-target', unitId: 'gen-1', range: [{ q: 1, r: 0 }] } };
    const result = resolveMapTapIntent(state, selection, { q: 9, r: 9 }, false);
    expect(result.kind).toBe('mistap');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/input/map-tap-intent.test.ts`
Expected: FAIL — type error / `last-stand-target` not a recognized `kind`.

- [ ] **Step 3: Add the new `PendingMapIntent` variant**

```ts
// src/app/ports.ts:66-70
export type PendingMapIntent =
  | { readonly kind: 'none' }
  | { readonly kind: 'journey'; readonly unitId: string }
  | { readonly kind: 'unload'; readonly transportId: string; readonly cargoUnitId: string; readonly range: readonly HexCoord[] }
  /** #544 MR4: Last Stand's target-hex selection. `range` is precomputed at
   * pending-intent-set time from getEffectiveCommandStats(general).commandRange,
   * mirroring `unload`'s own precomputed-range convention exactly. */
  | { readonly kind: 'last-stand-target'; readonly unitId: string; readonly range: readonly HexCoord[] }
  // ...rest of the union unchanged
```

- [ ] **Step 4: Wire the range check into `resolveMapTapIntent`**

```ts
// src/input/map-tap-intent.ts, alongside the existing `unload` in-range check (~line 117-119)
if (pending.kind === 'last-stand-target') {
  const inRange = pending.range.some(h => hexKey(h) === key);
  return inRange ? { kind: 'resolve-pending', pending, coord } : { kind: 'mistap', pending };
}
```

Add `'last-stand-target'` to the `ResolvablePendingIntent` extract list:

```ts
export type ResolvablePendingIntent = Extract<PendingMapIntent, { kind: 'journey' | 'air-mission' | 'unload' | 'paradrop' | 'air-assault' | 'last-stand-target' }>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/input/map-tap-intent.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing test for `createLastStandPanel`**

```ts
// tests/ui/general-command-panel.test.ts (append)
import { createLastStandPanel } from '@/ui/general-command-panel';
import type { LastStandPreview } from '@/systems/great-general-abilities';

describe('createLastStandPanel', () => {
  function makePreview(): LastStandPreview {
    return {
      eligibility: { eligible: true, chargesRemaining: 1, isFinalCharge: true, cooldownTurnsRemaining: 0 },
      targetHex: { q: 1, r: 0 },
      area: [{ q: 1, r: 0 }],
      targets: [{ unitId: 'unit-1' }],
      defenseBonusPercent: 15,
      durationTurns: 2,
    };
  }

  it('shows affected units, defense bonus, and duration', () => {
    const container = document.createElement('div');
    createLastStandPanel(container, makePreview(), () => {}, () => {});
    const text = container.textContent ?? '';
    expect(text).toMatch(/unit-1/);
    expect(text).toMatch(/15%/);
    expect(text).toMatch(/2/);
  });

  it('shows the Final Command notice when eligibility.isFinalCharge is true', () => {
    const container = document.createElement('div');
    createLastStandPanel(container, makePreview(), () => {}, () => {});
    expect(container.textContent).toMatch(/final command/i);
  });

  it('confirm invokes onConfirm exactly once', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createLastStandPanel(container, makePreview(), onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('review fix: disables Confirm when there are zero targets in the area', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createLastStandPanel(container, { ...makePreview(), targets: [] }, onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    confirmButton.click();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/general-command-panel.test.ts`
Expected: FAIL — `createLastStandPanel` not exported.

- [ ] **Step 8: Implement `createLastStandPanel`**

```ts
// src/ui/general-command-panel.ts (append)
import type { LastStandPreview } from '@/systems/great-general-abilities';

export function createLastStandPanel(
  container: HTMLElement,
  preview: LastStandPreview,
  onConfirm: () => void,
  onCancel: () => void,
): HTMLElement {
  const panel = panelShell(container, 'last-stand-panel');

  const title = document.createElement('h2');
  title.textContent = 'Last Stand';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  panel.appendChild(title);

  if (preview.eligibility.isFinalCharge) finalCommandNotice(panel);

  const summary = document.createElement('p');
  summary.textContent = `Defense +${preview.defenseBonusPercent}% for ${preview.durationTurns} turn(s), with one shared Hold! save for the formation.`;
  summary.style.cssText = 'font-size:13px;opacity:0.85;margin:0 0 8px;';
  panel.appendChild(summary);

  if (preview.targets.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No eligible combat units in that area.';
    empty.style.cssText = 'font-size:13px;opacity:0.8;';
    panel.appendChild(empty);
  }

  for (const target of preview.targets) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:6px;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;font-size:12px;';
    row.textContent = target.unitId;
    panel.appendChild(row);
  }

  confirmCancelRow(panel, onConfirm, onCancel, preview.targets.length === 0);
  return panel;
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/general-command-panel.test.ts`
Expected: PASS

- [ ] **Step 10: Wire targeting mode start (`selection-controller.ts`) and resolution (`map-interaction-controller.ts`)**

```ts
// src/app/controllers/selection-controller.ts -- alongside onOpenRally/onOpenSeize
onStartLastStandTargeting: (generalUnitId: string) => {
  const state = session.getState();
  const general = state.units[generalUnitId];
  const definition = general ? GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId) : undefined;
  if (!general || !definition) return;
  const { commandRange } = getEffectiveCommandStats(general, definition);
  const range = mapHexesInRange(state.map, general.position, commandRange);
  selection.setPendingIntent({ kind: 'last-stand-target', unitId: generalUnitId, range });
  deps.showNotification('Choose a hex to hold, within your General\'s command range.', 'info');
},
```

```ts
// src/app/controllers/map-interaction-controller.ts:123-153 -- add a case
// alongside 'journey'/'air-mission'/'paradrop' inside the resolve-pending switch
case 'last-stand-target': {
  const generalUnitId = intent.pending.unitId;
  const preview = getLastStandPreview(session.getState(), generalUnitId, coord);
  selection.setPendingIntent({ kind: 'none' });
  createLastStandPanel(
    deps.uiLayer,
    preview,
    () => {
      session.commit(issueLastStand(session.getState(), generalUnitId, coord));
      selectionController.selectUnit(generalUnitId);
    },
    () => {},
  );
  return;
}
```

Confirm the exact local binding name for `selectionController`/`selection`
in `map-interaction-controller.ts` by reading its top-of-file deps
destructure before writing this case for real — the surrounding cases in
this same switch (`journey`, `air-mission`) already show the pattern to copy.

- [ ] **Step 11: Manual verification in the browser** — spawn/fast-forward
to a General with an escort unit nearby, click Last Stand, tap a hex within
range, confirm the preview lists the escort and the defense bonus, confirm
issuing it sets `lastStandHold`, and that tapping outside range does nothing
(mistap) rather than crashing.

- [ ] **Step 12: Run the full input/controller test suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/input/map-tap-intent.test.ts tests/ui/general-command-panel.test.ts`
Expected: All PASS.

- [ ] **Step 13: Commit**

```bash
git add src/app/ports.ts src/input/map-tap-intent.ts src/app/controllers/map-interaction-controller.ts src/app/controllers/selection-controller.ts src/ui/general-command-panel.ts tests/input/map-tap-intent.test.ts tests/ui/general-command-panel.test.ts
git commit -m "feat(#544): MR4 Task 12 — Last Stand hex targeting and preview panel"
```

---

### Task 13: First-General tutorial and one contextual hint

**Files:**
- Modify: `src/core/types.ts:1891-1900` (`TutorialStep`)
- Modify: `src/ui/advisor-system.ts` (`ADVISOR_MESSAGES`)
- Modify: `src/ui/selected-unit-info.ts` (reopen callback, mirroring `onReopenSupplyTutorial`)
- Modify: `src/app/controllers/selection-controller.ts` (reopen wiring)
- Test: `tests/ui/advisor-system.test.ts`

**Interfaces:**
- Consumes: `AdvisorSystem.check`/`resetMessage` (existing, `advisor-system.ts`).
- Produces: `TutorialStep` gains `'general_command_intro'`;
  `SelectedUnitInfoCallbacks.onReopenGeneralTutorial?: () => void`.

- [ ] **Step 1: Write the failing test for the tutorial trigger**

Tutorial-tagged entries additionally require `state.tutorial.active === true`
and `!state.tutorial.completedSteps.includes('general_command_intro')` (per
`AdvisorSystem.check`'s own gating, confirmed by reading it directly) — set
both explicitly in the fixture. A firing tutorial entry emits **both**
`'tutorial:step'` (with `step: 'general_command_intro'`) and
`'advisor:message'` — assert on `'tutorial:step'` since that's the
step-specific signal.

```ts
// tests/ui/advisor-system.test.ts (append)
import { AdvisorSystem } from '@/ui/advisor-system';
import type { EventBus } from '@/core/event-bus';

describe('#544 MR4 — general_command_intro tutorial', () => {
  function baseState() {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'tut-1' });
    state.tutorial.active = true;
    return state;
  }

  function stepsFired(state: GameState): string[] {
    const emit = vi.fn();
    new AdvisorSystem({ emit } as unknown as EventBus).check(state);
    return emit.mock.calls.filter(call => call[0] === 'tutorial:step').map(call => call[1].step);
  }

  it('triggers once the player owns an operational (non-spawn-turn) General', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: state.currentPlayer, position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar',
    } as Unit;
    state.civilizations[state.currentPlayer].units.push('gen-1');
    expect(stepsFired(state)).toContain('general_command_intro');
  });

  it('does not trigger on the General\'s own spawn turn', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: state.currentPlayer, position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', generalNoCommandThisTurn: true,
    } as Unit;
    state.civilizations[state.currentPlayer].units.push('gen-1');
    expect(stepsFired(state)).not.toContain('general_command_intro');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/advisor-system.test.ts`
Expected: FAIL — no `general_command_intro` message exists.

- [ ] **Step 3: Add the `TutorialStep` value**

```ts
// src/core/types.ts:1891-1900
export type TutorialStep =
  | 'welcome'
  | 'found_city'
  | 'explore'
  | 'build_improvement'
  | 'research_tech'
  | 'build_unit'
  | 'combat'
  | 'complete'
  | 'supply_intro'
  | 'general_command_intro';
```

- [ ] **Step 4: Add the `ADVISOR_MESSAGES` entry**

Add alongside the existing `supply_intro` entry in `advisor-system.ts`,
following its exact documented pattern (not `viewerScoped`, matching every
other tutorial-tagged entry):

```ts
{
  // #544 MR4: first-General command tutorial. Same session-wide shownIds
  // convention as supply_intro -- see that entry's comment for why.
  id: 'general_command_intro',
  advisor: 'builder',
  icon: '⚔️',
  message: 'Your Great General can pause supply degradation for nearby units automatically, and holds 3 lifetime Command Charges shared across Rally (heal and steady a battered unit), Seize the Moment (one more action for a unit that already acted), and Last Stand (hold a position with a defense bonus and a one-time survival save). All three share one cooldown — the 3rd charge retires the General at the end of that turn.',
  // #544 MR4 review fix: scope through the current player's own unit roster
  // (civ.units), not a global Object.values(state.units) scan -- every other
  // trigger/eligibility function in this plan (Rally, Seize, Last Stand,
  // passive stabilization, the crisis hint in Step 7 below) already scopes
  // this way; a global per-unit scan here was the one inconsistent outlier,
  // and on a large map with many civs it's real wasted work run on every
  // single AdvisorSystem.check() call.
  trigger: (state) => (state.civilizations[state.currentPlayer]?.units ?? []).some(id => {
    const unit = state.units[id];
    return unit?.type === 'great_general' && unit.generalNoCommandThisTurn !== true;
  }),
  tutorialStep: 'general_command_intro',
},
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/advisor-system.test.ts`
Expected: PASS

- [ ] **Step 6: Wire the reopen callback**

```ts
// src/ui/selected-unit-info.ts -- add to SelectedUnitInfoCallbacks near onReopenSupplyTutorial
/** #544 MR4: reopens the first-time General command tutorial on demand. */
onReopenGeneralTutorial?: () => void;
```

In the existing `great_general` render block, add a help link next to the
existing ability buttons (mirror the supply tutorial's existing help-link
markup at line ~364-369 exactly):

```ts
if (callbacks.onReopenGeneralTutorial) {
  const helpLink = document.createElement('button');
  helpLink.textContent = 'How does command work?';
  // ...mirror the existing onReopenSupplyTutorial help-link's styling exactly (read line 364-369 first)
  helpLink.addEventListener('click', () => callbacks.onReopenGeneralTutorial!());
  container.appendChild(helpLink);
}
```

```ts
// src/app/controllers/selection-controller.ts -- alongside onReopenSupplyTutorial
onReopenGeneralTutorial: () => {
  deps.advisorSystem.resetMessage('general_command_intro');
  deps.advisorSystem.check(session.getState());
},
```

- [ ] **Step 7: Add one contextual hint — a friendly unit near death within an eligible General's Last Stand range**

This is the one hint contract §24 allows ("optional hints only for obvious
crises... never nag just because an ability is ready"). Add a second
`ADVISOR_MESSAGES` entry:

```ts
{
  id: 'general_last_stand_crisis_hint',
  advisor: 'warchief',
  icon: '⚔️',
  message: 'One of our units is badly wounded near an active General. Last Stand could hold the line if the position matters.',
  viewerScoped: true,
  trigger: (state) => {
    const civ = state.civilizations[state.currentPlayer];
    if (!civ) return false;
    const generals = civ.units
      .map(id => state.units[id])
      .filter((u): u is Unit => Boolean(u) && u.type === 'great_general' && !u.generalNoCommandThisTurn);
    if (generals.length === 0) return false;
    const woundedNearby = civ.units
      .map(id => state.units[id])
      .filter((u): u is Unit => Boolean(u) && u.health <= 25 && !UNIT_CLASS_BY_TYPE[u.type]?.includes('civilian'));
    return woundedNearby.some(unit => generals.some(general => {
      const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
      if (!definition) return false;
      return mapDistance(state.map, general.position, unit.position) <= definition.commandRange;
    }));
  },
},
```

(No `tutorialStep` — this is a recurring contextual hint, not a one-time
tutorial step, matching e.g. `chancellor_unrest_warning`'s existing
un-tagged, repeatable shape in this same file.)

- [ ] **Step 8: Add a trigger-condition test for the contextual hint**

`ADVISOR_MESSAGES` is module-private (`const`, not `export const` — confirmed
by grep before writing this) — this file's own tests exercise triggers
through the public `AdvisorSystem` class, not by reaching into the array
directly. `AdvisorSystem`'s constructor takes `(bus: EventBus)`; `.check(state)`
emits `'advisor:message'` (`{ advisor, message, icon }`) the first time a
non-tutorial-tagged entry's trigger fires (this hint deliberately has no
`tutorialStep`, per Step 7 above, so `'tutorial:step'` never fires for it).
Non-tutorial messages also require `state.settings.advisorsEnabled['warchief']`
to be true and no active `advisorDisabledUntil` cooldown — set both
explicitly in the fixture rather than relying on `createNewGame`'s defaults,
so the test can't silently pass/fail based on an unrelated default changing
later.

```ts
// tests/ui/advisor-system.test.ts (append)
import { AdvisorSystem } from '@/ui/advisor-system';
import type { EventBus } from '@/core/event-bus';

function makeCombatUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: 20, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  } as Unit;
}

function makeGeneralUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    generalDefinitionId: 'gen_caesar', ...overrides,
  } as Unit;
}

describe('#544 MR4 — general_last_stand_crisis_hint trigger', () => {
  function baseState() {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'hint-1' });
    state.settings.advisorsEnabled.warchief = true;
    return state;
  }

  function fires(state: GameState): boolean {
    const emit = vi.fn();
    new AdvisorSystem({ emit } as unknown as EventBus).check(state);
    return emit.mock.calls.some(call => call[0] === 'advisor:message' && call[1].message.includes('Last Stand'));
  }

  it('fires when a low-HP combat unit is within an eligible General\'s command range', () => {
    const state = baseState();
    state.units['gen-1'] = makeGeneralUnit(); // V1 commandRange = 2
    state.units['unit-1'] = makeCombatUnit({ position: { q: 1, r: 0 }, health: 20 }); // <= 25 HP threshold
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    expect(fires(state)).toBe(true);
  });

  it('does not fire when a General exists but no unit nearby is wounded', () => {
    const state = baseState();
    state.units['gen-1'] = makeGeneralUnit();
    state.units['unit-1'] = makeCombatUnit({ position: { q: 1, r: 0 }, health: 100 });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    expect(fires(state)).toBe(false);
  });

  it('does not fire when the wounded unit is outside the General\'s command range', () => {
    const state = baseState();
    state.units['gen-1'] = makeGeneralUnit();
    state.units['unit-1'] = makeCombatUnit({ position: { q: 10, r: 10 }, health: 20 });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    expect(fires(state)).toBe(false);
  });

  it('does not fire when the only nearby low-HP unit is a civilian', () => {
    const state = baseState();
    state.units['gen-1'] = makeGeneralUnit();
    state.units['unit-1'] = { ...makeCombatUnit({ position: { q: 1, r: 0 }, health: 20 }), type: 'worker' };
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    expect(fires(state)).toBe(false);
  });

  it('does not fire when the civ has no operational General at all', () => {
    const state = baseState();
    state.units['unit-1'] = makeCombatUnit({ position: { q: 1, r: 0 }, health: 20 });
    state.civilizations.player.units = ['unit-1'];
    expect(fires(state)).toBe(false);
  });
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/advisor-system.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/core/types.ts src/ui/advisor-system.ts src/ui/selected-unit-info.ts src/app/controllers/selection-controller.ts tests/ui/advisor-system.test.ts
git commit -m "feat(#544): MR4 Task 13 — first-General tutorial and Last Stand contextual hint"
```

---

### Task 14: Legacy-save verification (no migration needed)

**Files:**
- Modify: `src/storage/save-migrations.ts` — verify only, no code change expected.
- Test: `tests/storage/save-migrations.test.ts`

**Interfaces:**
- Consumes: `migrateSaveToCurrent` (`save-migrations.ts`, existing).

- [ ] **Step 1: Write the failing (or trivially-passing, confirming) test**

```ts
// tests/storage/save-migrations.test.ts (append)
describe('#544 MR4 — legacy save load with no General heroic-command fields', () => {
  it('a save with a great_general unit but no generalCommandChargesUsed/cooldown/lastStandHold fields loads without error, defaulting to full charges', () => {
    const raw = /* build a minimal valid save object using this file's
      existing raw-save fixture convention, at CURRENT_SAVE_SCHEMA_VERSION,
      with one great_general unit that has generalDefinitionId set but none
      of the MR4 fields present */;
    const state = migrateSaveToCurrent(raw);
    const general = Object.values(state.units).find(u => u.type === 'great_general')!;
    expect(general.generalCommandChargesUsed).toBeUndefined();
    expect(general.generalCommandCooldownUntilTurn).toBeUndefined();
    expect(general.lastStandHold).toBeUndefined();
  });

  it('getHeroicCommandEligibility on that legacy-loaded General reports full charges and no cooldown', () => {
    const raw = /* same fixture as above */;
    const state = migrateSaveToCurrent(raw);
    const general = Object.values(state.units).find(u => u.type === 'great_general')!;
    const eligibility = getHeroicCommandEligibility(state, general);
    expect(eligibility.chargesRemaining).toBe(3);
    expect(eligibility.cooldownTurnsRemaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes immediately** (this task is a
verification task, not a new-feature task — the optional-field design from
Task 1 should already satisfy this with zero production code changes)

Run: `bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations.test.ts`
Expected: PASS on first run. **If it fails**, that is a real signal Task 1's
"undefined = default" design has a gap (e.g. a stray non-optional field, or
`migrateSaveToCurrent` stripping unknown fields) — stop and fix Task 1's
types before continuing, do not add a migration entry as a workaround for a
type-design bug.

- [ ] **Step 3: Commit**

```bash
git add tests/storage/save-migrations.test.ts
git commit -m "test(#544): MR4 Task 14 — verify legacy saves need no General heroic-command migration"
```

---

### Task 15: Difficulty-invariance, hot-seat privacy, and movement-stacking regressions

**Files:**
- Modify: `tests/systems/great-general-mr3-invariants.test.ts` (rename its
  describe blocks' era to cover MR4, or add a sibling
  `tests/systems/great-general-mr4-invariants.test.ts` — pick whichever
  keeps the file under a reasonable size; if MR3's file is already large,
  create the sibling instead of growing it further).

**Interfaces:**
- Consumes: every function from Tasks 3-9 (`great-general-abilities.ts`,
  `great-general-system.ts`).

- [ ] **Step 1: Write the difficulty-invariance regressions**

```ts
// tests/systems/great-general-mr4-invariants.test.ts (new file, or appended
// to the MR3 sibling — see Files note above)
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  getHeroicCommandEligibility, issueRally, issueSeizeTheMoment, issueLastStand,
} from '@/systems/great-general-abilities';
import { getPassiveStabilizationTargets } from '@/systems/great-general-system';
import type { Unit } from '@/core/types';

function makeGeneral(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    generalDefinitionId: 'gen_caesar', ...overrides,
  } as Unit;
}

describe('#544 MR4 — difficulty invariance', () => {
  it('getHeroicCommandEligibility never reads opponentChallenge/challenge (structural: no such parameter exists)', () => {
    expect(getHeroicCommandEligibility.length).toBe(2); // (state, general) -- no difficulty parameter
  });

  it('getPassiveStabilizationTargets produces identical results regardless of opponentChallenge', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'inv-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    const explorer = getPassiveStabilizationTargets({ ...state, opponentChallenge: 'explorer' }, 'player');
    const veteran = getPassiveStabilizationTargets({ ...state, opponentChallenge: 'veteran' }, 'player');
    expect(explorer).toEqual(veteran);
  });

  it('Rally\'s HP restore and stage-clear amount are identical regardless of opponentChallenge', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'inv-2' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    const explorerResult = issueRally({ ...state, opponentChallenge: 'explorer' }, 'gen-1');
    const veteranResult = issueRally({ ...state, opponentChallenge: 'veteran' }, 'gen-1');
    expect(explorerResult.units['unit-1'].health).toBe(veteranResult.units['unit-1'].health);
    expect(explorerResult.units['unit-1'].landSupply).toEqual(veteranResult.units['unit-1'].landSupply);
  });

  it('no function exported from great-general-abilities.ts or great-general-system.ts reads GameState.opponentChallenge or Civilization.challenge', async () => {
    // Static-ish guard: grep the two module source files for the literal
    // substrings, since a structural test cannot see inside function bodies.
    const fs = await import('node:fs');
    const abilitiesSource = fs.readFileSync('src/systems/great-general-abilities.ts', 'utf8');
    const systemSource = fs.readFileSync('src/systems/great-general-system.ts', 'utf8');
    expect(abilitiesSource).not.toMatch(/opponentChallenge|\.challenge\b/);
    expect(systemSource.replace(/getGeneralThreshold[\s\S]*?^\}/m, '')).not.toMatch(/opponentChallenge/);
  });
});

describe('#544 MR4 — hot-seat privacy', () => {
  it('Rally, Seize, and Last Stand issuance only ever touch the issuing General\'s own owner civ', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'priv-1' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral();
    // #544 MR4 review fix: the original fixture had ONLY the General in
    // 'player's roster, so issueRally/issueSeizeTheMoment/issueLastStand
    // all found zero eligible targets and short-circuited to a pure
    // pass-through -- the assertions below were trivially true regardless
    // of whether the privacy guarantee actually held, because nothing ran.
    // A real friendly unit near the General (in range, degraded, and
    // already-acted so it's simultaneously Rally- and Seize-eligible)
    // forces all three abilities to do real work, so this test actually
    // exercises the isolation claim instead of vacuously passing.
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 40, experience: 0, hasMoved: true, hasActed: true, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    const aiCivBefore = state.civilizations[aiId];

    const rallied = issueRally(state, 'gen-1');
    expect(rallied.units['unit-1'].health).toBeGreaterThan(40); // sanity: Rally actually did something
    expect(rallied.civilizations[aiId]).toBe(aiCivBefore);

    const seized = issueSeizeTheMoment(state, 'gen-1', ['unit-1']);
    expect(seized.units['unit-1'].hasActed).toBe(false); // sanity: Seize actually did something
    expect(seized.civilizations[aiId]).toBe(aiCivBefore);

    const lastStood = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    expect(lastStood.units['unit-1'].lastStandHold).toBeDefined(); // sanity: Last Stand actually did something
    expect(lastStood.civilizations[aiId]).toBe(aiCivBefore);
  });
});

describe('#544 MR4 — movement bonus stacking policy (game-balance.md)', () => {
  it('Seize the Moment never changes movementPointsLeft', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'move-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-1']);
    expect(result.units['unit-1'].movementPointsLeft).toBe(0);
  });

  it('no ability in great-general-abilities.ts writes to Unit.movementBonus or Unit.movementPointsLeft except the explicit no-op assertion above (source grep)', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('src/systems/great-general-abilities.ts', 'utf8');
    expect(source).not.toMatch(/movementBonus/);
    expect(source).not.toMatch(/movementPointsLeft\s*:/); // never assigns it, only reads
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-mr4-invariants.test.ts`
Expected: PASS. If the source-grep tests fail, that is a real invariant
violation in Tasks 4-9's implementation — fix the implementation, do not
weaken the grep.

- [ ] **Step 3: Confirm no new row is needed in `.claude/rules/game-balance.md`'s Movement Bonus Stacking Policy table**

Re-read that table's "Current movement bonus inventory" — MR4 introduces no
entry (Task Step 2's grep-based test is the mechanical proof). No edit to
that file is needed. Note this explicitly in the PR body (Task 16) so a
reviewer doesn't have to re-derive it.

- [ ] **Step 4: Commit**

```bash
git add tests/systems/great-general-mr4-invariants.test.ts
git commit -m "test(#544): MR4 Task 15 — difficulty invariance, hot-seat privacy, movement-stacking regressions"
```

---

## Pre-implementation review pass (completed)

Per the handoff doc's process reminder 5 ("two inline review passes --
before and after implementing"), this plan itself was reviewed inline
(2026-08-24) across gameplay balance, fun/age-accessibility (7-43), play
styles, difficulty-mode fairness, AI usage, UI/UX, architecture,
extensibility, data, SFX, save-migration impact, test coverage, and solo/
hot-seat regressions, before any implementation began. Ten concrete issues
were found and fixed directly in this document (not deferred to Task 16):

1. Rally and Seize the Moment could burn a lifetime Command Charge on a
   complete no-op (zero eligible targets/selections) — Last Stand already
   guarded against this, Rally/Seize now match (Tasks 5, 6).
2. Seize's unit picker showed raw internal `UnitType` strings instead of
   real display names, with no way to tell apart two units of the same type
   (Task 6).
3. The Seize panel had no empty-state message, unlike Rally and Last Stand
   (Task 11).
4. None of the three ability panels disabled Confirm when there was nothing
   to confirm — added UI-layer defense-in-depth alongside the charge-spend
   guards from #1 (Tasks 11, 12).
5. ~~The no-chained-capture guard only covered `beginMajorCityAssault`,
   missing `ai-tactics.ts`'s separate `'capture-city'` action path entirely~~
   — **corrected during implementation (Task 6):** that second path is a
   discarded lookahead-scoring scratch state, never real game state; the
   real AI execution path already routed through the guarded function.
   No code change was needed after all — see Task 6's implementation-time
   correction note for the verification trail.
6. General retirement was completely silent — no notification when a
   General vanishes at end of turn, unlike death (visible via combat). Added
   a `general:retired` event through this codebase's established
   event-to-notification pipeline (Task 9).
7. A contextual-hint test was a comment-only stub with no real assertions —
   a direct "No Placeholders" violation; also discovered `ADVISOR_MESSAGES`
   is module-private, so both this test and the tutorial-trigger test were
   rewritten against the real, verified `AdvisorSystem` API (Task 13).
8. The tutorial's trigger scanned every unit in the entire game instead of
   scoping to the player's own civ roster, inconsistent with every other
   function in this plan (Task 13).
9. The hot-seat privacy test for Last Stand was vacuous — its fixture had
   zero eligible targets, so `issueLastStand` short-circuited to a pure
   pass-through and the "AI civ untouched" assertion was trivially true
   regardless of whether the real guarantee held (Task 15).
10. A command-panel stats line re-derived a definition lookup the same block
    had already computed (Task 10).

A documentation gap was also closed (not a bug): Last Stand's Hold save
pre-empting naval prize-capture is intentional but was unstated — now
documented and locked in with a test (Task 8).

---

### Task 16: Full-suite verification, second review pass, and issue checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md`
  (§10 phasing table — mark MR4 status, matching MR1-MR3's own entries there)
- Modify: issue #544 (GitHub, via `gh issue edit` or the web UI — not a repo
  file) — tick the MR4 checkbox and link the PR, matching MR1-MR3's own
  convention, **only after explicit user authorization to merge**, per
  process reminder 9 (handoff doc, and MR1-MR3's own precedent).

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests PASS, including `national-project-balance.test.ts`,
`wonder-definitions.test.ts` (unaffected by this MR, but must still pass),
and specifically `pacing-audit.test.ts`/`pacing-reference-economy.test.ts`
(per `.claude/rules/game-balance.md`'s Pacing Regression Prevention rule —
Last Stand's defense bonus and Rally's healing are new economy-adjacent
combat effects; if either shifts a reference-economy snapshot, that's a
real signal to investigate before treating it as a snapshot-update formality).

- [ ] **Step 2: Run the full build/typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — this is the only path that runs `tsc`, per this repo's
`CLAUDE.md`.

- [ ] **Step 3: Second inline review pass**

Per the handoff doc's process reminder 5 ("two inline review passes...
don't skip this as a formality — MR3's second pass caught a real soft-lock
bug"), re-read the full diff against each of these dimensions and fix
anything found before commit:

- **Gameplay balance:** Rally's +30 HP and one-stage clear, Last Stand's
  +15%/2-turn/one-shot-save, and the 3-charge/~10-turn-cooldown resource
  model — do these feel proportionate to a once-per-~10-turns, 3-lifetime-use
  resource? Compare against `.claude/rules/game-balance.md`'s wonder/national-
  project ceilings for a sense of scale (this MR isn't a yield bonus, so
  those exact ceilings don't apply, but the "moderate, not dominant" spirit
  does).
- **Fun/age-accessibility (~7-43):** does the command-panel stats line read
  clearly to a 7-year-old ("Charges 2/3")? Is "Final Command" framed as
  exciting rather than punishing?
- **Play styles:** does a purely defensive/turtling player get real value
  from Last Stand and passive stabilization without ever needing Seize/Rally?
  Does an aggressive player get value from Seize without needing Last Stand?
- **Difficulty-mode fairness:** re-confirm Task 15's grep-based invariant
  tests actually run and pass — this is the one dimension with a mechanical
  check, but a human read is still worth doing in case the grep pattern has
  a blind spot (e.g. a differently-named difficulty field introduced
  elsewhere in the codebase since this plan was written).
- **UI/UX:** do all three ability buttons disable with a visible reason when
  ineligible (Task 10)? Does Last Stand's mistap (tapping outside range) give
  any feedback, or does it silently do nothing? If silent, add a
  notification in Task 12's `case 'last-stand-target':` mistap path — check
  whether `handleHexTap`'s `case 'mistap':` already shows one generically
  before adding a redundant one.
- **Architecture/SRP:** does `great-general-abilities.ts` stay focused on
  the three abilities plus their shared spend/eligibility, with lifecycle
  (spawn/retire/death) staying in `great-general-system.ts` as designed?
- **Extensibility:** does adding a 4th heroic ability later require touching
  `GeneralDefinition.abilityIds` handling anywhere in a way that would break
  (it shouldn't — `abilityIds` isn't actually branched on anywhere in this
  MR's V1 implementation, since every General gets all three abilities; a
  future MR that wants per-definition ability variance would need to add the
  first real `abilityIds`-gated check — note this honestly rather than
  claiming false generality)?
- **Data:** re-run the roster `replace_all` from Task 1 mentally — did all
  `GENERAL_DEFINITIONS` entries actually get the three new fields, or did
  a differently-formatted line (e.g. `gen_hannibal`'s or the fantasy-civ
  block) slip through the exact-substring match? Grep
  `grep -c "maxCommandCharges: V1_MAX_COMMAND_CHARGES" src/systems/great-general-definitions.ts`
  and confirm the count matches the roster's real total — 34 as of this MR
  (verified during implementation; the plan's original draft mis-stated this
  as 25, a manual miscount when the plan was first written, not a real defect
  in the `replace_all` step itself, which is exact-substring-based and
  therefore count-agnostic).
- **SFX:** no new SFX cue exists for Rally/Seize/Last Stand issuance or the
  Hold-save trigger — this MR intentionally ships without one (contract
  doesn't mandate audio, and this repo's audio curation is tracked
  separately per prior memory of this project's audio backlog). Note this
  explicitly in the PR body as a deliberate omission, not an oversight.
- **Save-migration impact:** re-confirm Task 14's legacy-load test actually
  exercises a save with a `great_general` unit predating MR4's fields, not
  just an empty save.
- **Test coverage:** does every contract rule in §16-22 have at least one
  test tracing back to it (the plan's own test blocks cite contract section
  numbers throughout — use that as the coverage checklist)?
- **Solo vs. hot-seat regressions:** Task 15's hot-seat privacy test covers
  ability issuance; does the tutorial trigger (Task 13) and the contextual
  hint correctly gate on `state.currentPlayer` in hot-seat rather than firing
  for whichever civ happens to own a General?
- **TypeScript quality:** run `bash scripts/run-with-mise.sh yarn build`
  again after any fixes from this review pass — don't just eyeball it.

- [ ] **Step 4: Confirm `GENERAL_DEFINITIONS` roster coverage**

Run: `grep -c "maxCommandCharges: V1_MAX_COMMAND_CHARGES" src/systems/great-general-definitions.ts`
Expected: `34` (every existing roster entry, confirmed during implementation).

- [ ] **Step 5: Update the design-spec phasing table**

In `docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md`
§10, find the MR4 row/entry and mark it `✅ merged` once the PR lands (or
`🟡 in review` if committing this status update before merge) — matching
`.claude/rules/spec-fidelity.md`'s "Plan Docs Must Stay Synced With Merged
Phases" rule, applied here to the sibling design-spec doc that also carries
phase status.

- [ ] **Step 6: Re-run the full suite one final time**

Run: `bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build`
Expected: both exit 0.

- [ ] **Step 7: Prepare the PR (do not merge without explicit user authorization)**

PR title: `feat(#544): MR4 — Passive command + heroic abilities`. PR body
must include:
- Summary of Rally/Seize the Moment/Last Stand/Final Command/passive
  stabilization, each in one sentence.
- A "Deliberately out of scope" section naming: MR1.1 (road/rail supply
  extension, still open per the handoff doc), MR5 (AI evaluators for these
  three abilities), MR6 (dedicated hot-seat/save validation pass beyond
  Task 14/15's regressions), the pre-existing `geneTherapyReady`-splash gap
  noted in Task 8 (real, not fixed here, not introduced by this MR either).
- The "no new movement-bonus-table row needed" note from Task 15 Step 3.
- The "no new SFX cue" note from Task 16 Step 3.
- Confirmation both `yarn test` and `yarn build` pass.

```bash
git push -u origin HEAD
gh pr create --title "feat(#544): MR4 — Passive command + heroic abilities" --body "$(cat <<'EOF'
...(per the content list above)...
EOF
)"
```

- [ ] **Step 8: Tick issue #544's MR4 checkbox and link the PR** — only
after the user explicitly authorizes it, matching MR1-MR3's own convention
(process reminder 9). Do not do this automatically as part of finishing the
plan.

---
