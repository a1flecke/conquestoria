# #545 MR5 — AI Deterrence Visibility & Launch Doctrine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. **Do not use superpowers:subagent-driven-development or any other multi-agent workflow — this repository's CLAUDE.md forbids subagents/parallel agents for all work; execute every task inline in the current session.** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI a bounded, reviewable ability to know about and use strategic weapons — a visibility rule + conventional-war caution factor (§9), and a first-use/retaliation launch doctrine (§10) — without ever bypassing MR4's `executeStrategicLaunch` entry point or MR1–3's legality/resolution/reputation machinery.

**Architecture:** A new leaf module `src/ai/ai-strategic-doctrine.ts` owns all launch-decision logic (existential-threat gate, retaliation willingness, target selection) and is the only new AI-facing surface; it's consumed from one new call site in `basic-ai.ts`'s existing per-civ diplomacy block. A new pure visibility predicate (`hasKnownStrategicCapability`) is shared verbatim by AI war-scoring (`shouldDeclareWar`), the diplomacy panel, and the launch-preview UI — one source of truth, per the design doc. The existing MR4 SFX/notification wiring is consolidated into a single registrar-owned trigger, because MR5 is the first MR where a strike can happen with no UI controller in the loop at all.

**Tech Stack:** TypeScript, Canvas 2D + DOM UI, vitest, deterministic seeded RNG (`createRng` from `@/systems/map-generator`).

## Global Constraints

- NEVER use `Math.random()` — the new retaliation-willingness roll uses `createRng(seed)`, seeded from `civId` + `state.turn`, same convention as this file's existing `ai-spy-${civId}-${newState.turn}` / `ai-capture-${civId}-${newState.turn}` seeds.
- Immutable turn processing — every state mutation in `basic-ai.ts` follows the file's existing spread-copy convention; never write through a stale `civ` reference after `newState.civilizations[civId]` has been mutated.
- AI opponent-behavior knobs (the two new `OpponentChallengeProfile` fields) MUST be read via `OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)]` — the **game-wide** difficulty — never `resolveChallengeForCiv`/`getChallengeProfileForCiv`, which governs only internal-pressure knobs (crises/unrest) per that function's own doc comment in `src/core/opponent-challenge.ts`. Using the per-civ resolver here would let a human's own personal-challenge setting leak into AI aggression scoring against them.
- `strategicDeterrenceCautionWeight` must never be large enough, at any difficulty, that a sufficiently motivated AI (high military advantage, terrible relationship) cannot still cross the war-declaration threshold — caution, not immunity. `strategicLaunchRetaliationWillingness` must stay strictly below `1.0` at every difficulty — a value of exactly `1.0` would make the very next eligible turn a deterministic counter-launch, contradicting "retaliation is never automatic/scripted."
- `evaluateStrategicLaunchDecision` (the new AI doctrine) must never call `resolveStrategicStrike` directly — only `executeStrategicLaunch` (MR4's sole entry point) may resolve a strike.
- AI target consideration is bounded to major civs the acting civ is currently `atWarWith`, using only already-discovered cities (`getLegalStrategicLaunchTargets`) — no unbounded all-map scan, and minor civs (city-states) are explicitly excluded from AI-authorized targets.
- XSS-safe rendering: every new UI text node (diplomacy panel note, launch-preview note) is injected via `textContent`, never `innerHTML`.
- Hot-seat: `state.currentPlayer` is the only viewer identity ever used for per-viewer gating (SFX); never hardcode `'player'`.
- `yarn build` (not just `yarn test`, which does not type-check) must be run after any task that changes a widely-shared function signature or the `GameEvents` type — Tasks 3, 4, and 9 below each call this out explicitly, per this arc's own MR4 lesson.

---

## File Map

| File | Change |
|---|---|
| `src/systems/strategic-arsenal-system.ts` | + `hasKnownStrategicCapability` |
| `src/core/opponent-challenge.ts` | + `strategicDeterrenceCautionWeight`, `strategicLaunchRetaliationWillingness` |
| `src/ai/ai-personality.ts` | `shouldDeclareWar` signature extension |
| `src/ai/ai-diplomacy.ts` | `DiplomaticContext` + `evaluateDiplomacy` extension |
| `src/ai/basic-ai.ts` | thread new context/knob through; new AI launch-decision call site |
| `src/ui/diplomacy-panel.ts` | + caution relationship-modifier note |
| `src/ai/ai-strategic-doctrine.ts` (**new**) | existential-threat gate + retaliation decision |
| `src/core/types.ts` | `GameEvents['city:strategic-strike']` gains `actorCivId` |
| `src/app/controllers/panel-actions-controller.ts` | remove direct SFX call, add `actorCivId` to emit |
| `src/app/controllers/selection-controller.ts` | remove direct SFX call, add `actorCivId` to emit |
| `src/presentation/register-strategic-strike-presentation.ts` | consolidated SFX + witness notification |
| `src/ui/strategic-launch-flow.ts` | + retaliation-risk preview note |

---

### Task 1: `hasKnownStrategicCapability` visibility predicate

**Files:**
- Modify: `src/systems/strategic-arsenal-system.ts`
- Test: `tests/systems/strategic-arsenal-system.test.ts`

**Interfaces:**
- Produces: `hasKnownStrategicCapability(state: GameState, viewerCivId: string, ownerCivId: string): boolean` — true iff the viewer has met the owner AND the owner has completed Manhattan Project. Consumed by Tasks 4, 5, 6/7, and 10.

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/strategic-arsenal-system.test.ts`, after the existing `describe('hasManhattanProject', ...)` block (which ends around line 67) and before the `makeCiv` helper:

```ts
import { hasKnownStrategicCapability } from '@/systems/strategic-arsenal-system';

describe('hasKnownStrategicCapability (#545 MR5)', () => {
  it('is false when the viewer has not met the owner, even with Manhattan Project built', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: [] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: [] }),
      },
      builtNationalProjects: { 'owner:manhattan_project': { civId: 'owner', cityId: 'c1', eraBuilt: 10 } },
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(false);
  });

  it('is false when met but Manhattan Project is not built', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: ['owner'] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: [] }),
      },
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(false);
  });

  it('is true when met and Manhattan Project is built', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: ['owner'] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: [] }),
      },
      builtNationalProjects: { 'owner:manhattan_project': { civId: 'owner', cityId: 'c1', eraBuilt: 10 } },
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(true);
  });

  it('meeting can be evidenced from either side (target knows viewer)', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: [] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: ['viewer'] }),
      },
      builtNationalProjects: { 'owner:manhattan_project': { civId: 'owner', cityId: 'c1', eraBuilt: 10 } },
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(true);
  });
});
```

Note: `makeCiv` in this file (defined below the `hasManhattanProject` block, around line 69) does not currently accept a `knownCivilizations` override in its default object — it's an `Omit`-free literal with `...overrides` spread last, so `knownCivilizations: [...]` passed via `overrides` works without any change to the helper itself.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-system.test.ts`
Expected: FAIL with "hasKnownStrategicCapability is not exported" / "is not a function"

- [ ] **Step 3: Implement**

In `src/systems/strategic-arsenal-system.ts`, change the top import and add the function after `hasManhattanProject`:

```ts
import type { Civilization, GameState } from '@/core/types';
import { hasMetCivilization } from '@/systems/discovery-system';
```

```ts
/**
 * #545 MR5 spec §9: one source of truth for "does viewerCivId know ownerCivId
 * has nuclear capability" -- shared verbatim by AI war-scoring
 * (shouldDeclareWar), the diplomacy panel's caution note, and the launch-
 * preview's retaliation-risk note. Never exposes the exact arsenal count --
 * only this boolean.
 */
export function hasKnownStrategicCapability(
  state: GameState,
  viewerCivId: string,
  ownerCivId: string,
): boolean {
  return hasMetCivilization(state, viewerCivId, ownerCivId)
    && hasManhattanProject(state, ownerCivId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/strategic-arsenal-system.ts tests/systems/strategic-arsenal-system.test.ts
git commit -m "feat(#545): add hasKnownStrategicCapability visibility predicate (MR5 Task 1)"
```

---

### Task 2: `OpponentChallengeProfile` deterrence/retaliation knobs

**Files:**
- Modify: `src/core/opponent-challenge.ts`
- Test: `tests/core/opponent-challenge.test.ts`

**Interfaces:**
- Produces: `OpponentChallengeProfile.strategicDeterrenceCautionWeight: number`, `OpponentChallengeProfile.strategicLaunchRetaliationWillingness: number`. Consumed by Tasks 3/4 (caution weight) and 6/7 (retaliation willingness).

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/opponent-challenge.test.ts`, after the existing `describe('#544 MR5 — General-command difficulty knobs', ...)` block:

```ts
describe('#545 MR5 — strategic deterrence and launch-doctrine knobs', () => {
  it('strategicDeterrenceCautionWeight increases with difficulty and never reaches or exceeds 1', () => {
    expect(OPPONENT_CHALLENGE_PROFILES.explorer.strategicDeterrenceCautionWeight).toBeLessThan(
      OPPONENT_CHALLENGE_PROFILES.standard.strategicDeterrenceCautionWeight);
    expect(OPPONENT_CHALLENGE_PROFILES.standard.strategicDeterrenceCautionWeight).toBeLessThan(
      OPPONENT_CHALLENGE_PROFILES.veteran.strategicDeterrenceCautionWeight);
    for (const profile of Object.values(OPPONENT_CHALLENGE_PROFILES)) {
      expect(profile.strategicDeterrenceCautionWeight).toBeGreaterThan(0);
      expect(profile.strategicDeterrenceCautionWeight).toBeLessThan(1);
    }
  });

  it('strategicLaunchRetaliationWillingness increases with difficulty and is hard-capped below 1 (never automatic/scripted retaliation)', () => {
    expect(OPPONENT_CHALLENGE_PROFILES.explorer.strategicLaunchRetaliationWillingness).toBeLessThan(
      OPPONENT_CHALLENGE_PROFILES.standard.strategicLaunchRetaliationWillingness);
    expect(OPPONENT_CHALLENGE_PROFILES.standard.strategicLaunchRetaliationWillingness).toBeLessThan(
      OPPONENT_CHALLENGE_PROFILES.veteran.strategicLaunchRetaliationWillingness);
    for (const profile of Object.values(OPPONENT_CHALLENGE_PROFILES)) {
      expect(profile.strategicLaunchRetaliationWillingness).toBeLessThan(1);
    }
  });

  it('carries the exact spec values', () => {
    expect(OPPONENT_CHALLENGE_PROFILES.explorer).toMatchObject({
      strategicDeterrenceCautionWeight: 0.05, strategicLaunchRetaliationWillingness: 0.15 });
    expect(OPPONENT_CHALLENGE_PROFILES.standard).toMatchObject({
      strategicDeterrenceCautionWeight: 0.1, strategicLaunchRetaliationWillingness: 0.5 });
    expect(OPPONENT_CHALLENGE_PROFILES.veteran).toMatchObject({
      strategicDeterrenceCautionWeight: 0.15, strategicLaunchRetaliationWillingness: 0.85 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/opponent-challenge.test.ts`
Expected: FAIL (TypeScript error / undefined property on `OPPONENT_CHALLENGE_PROFILES.explorer.strategicDeterrenceCautionWeight`)

- [ ] **Step 3: Implement**

In `src/core/opponent-challenge.ts`, add to the `OpponentChallengeProfile` interface, after `generalSafetyWeight`:

```ts
  // #545 MR5: how strongly known strategic (nuclear) capability on a potential
  // war target raises the war-declaration threshold in shouldDeclareWar.
  // Deterrence, not immunity -- see the "never grants immunity" invariant
  // test in tests/ai/ai-personality.test.ts. Veteran gets the LARGEST value
  // here (opposite polarity from an eagerness knob like submarineEscortWeight)
  // because veteran is the "smartest" difficulty and should respect a
  // demonstrated deterrent the most -- same explorer < standard < veteran
  // direction as every other knob, different effect.
  strategicDeterrenceCautionWeight: number;
  // #545 MR5: probability-of-launching-this-turn once an AI is
  // retaliation-eligible (isStrategicStrikeRetaliation true for some legal
  // target). Explorer lowest ("heavily suppressed"), veteran highest
  // ("maximally willing"). Hard-capped below 1.0 -- see this file's own
  // header constraint above. First-use willingness is NOT a probability
  // knob (Explorer/Standard never authorize it; Veteran's gate is the
  // deterministic existential-threat check in ai-strategic-doctrine.ts) --
  // this knob governs retaliation only.
  strategicLaunchRetaliationWillingness: number;
```

Add the corresponding field to each of the three profile objects, immediately after `generalSafetyWeight`:

```ts
  explorer: {
    // ...existing fields...
    generalSafetyWeight: 1.5,
    strategicDeterrenceCautionWeight: 0.05,
    strategicLaunchRetaliationWillingness: 0.15,
  },
  standard: {
    // ...existing fields...
    generalSafetyWeight: 1.0,
    strategicDeterrenceCautionWeight: 0.1,
    strategicLaunchRetaliationWillingness: 0.5,
  },
  veteran: {
    // ...existing fields...
    generalSafetyWeight: 0.7,
    strategicDeterrenceCautionWeight: 0.15,
    strategicLaunchRetaliationWillingness: 0.85,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/opponent-challenge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/opponent-challenge.ts tests/core/opponent-challenge.test.ts
git commit -m "feat(#545): add strategic deterrence/retaliation difficulty knobs (MR5 Task 2)"
```

---

### Task 3: `shouldDeclareWar` deterrence-caution term

**Files:**
- Modify: `src/ai/ai-personality.ts`
- Test: `tests/ai/ai-personality.test.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks (pure function, caller passes the boolean/weight).
- Produces: `shouldDeclareWar(personality, relationship, militaryAdvantage, currentTurn, hasMetTarget, hasBorderPressure, targetHasKnownStrategicCapability: boolean, strategicDeterrenceCautionWeight: number): boolean`. Consumed by Task 4.

**⚠️ This changes an existing exported function's signature — its only caller today is `evaluateDiplomacy` in `ai-diplomacy.ts` (updated in Task 4) and its only direct test caller is `tests/ai/ai-personality.test.ts` (updated in this task). Run `bash scripts/run-with-mise.sh yarn build` after this task, not just the test file, since `yarn test` does not type-check.**

- [ ] **Step 1: Update the existing tests and write the new failing tests**

In `tests/ai/ai-personality.test.ts`, update all 4 existing `shouldDeclareWar(...)` calls inside `describe('shouldDeclareWar', ...)` to append `, false, 0` (no known capability, zero caution weight — preserves their original meaning exactly):

```ts
  describe('shouldDeclareWar', () => {
    it('aggressive civ with military advantage declares war', () => {
      expect(shouldDeclareWar(aggressive, -10, 1.5, 12, true, true, false, 0)).toBe(true);
    });

    it('diplomatic civ avoids war even with advantage', () => {
      expect(shouldDeclareWar(diplomatic, 10, 1.5, 12, true, true, false, 0)).toBe(false);
    });

    it('no one declares war with positive relationship above 30', () => {
      expect(shouldDeclareWar(aggressive, 40, 2.0, 12, true, true, false, 0)).toBe(false);
    });

    it('does not declare war on turn 1 against an unmet rival even with advantage', () => {
      expect(shouldDeclareWar(aggressive, -60, 2.0, 1, false, false, false, 0)).toBe(false);
    });
  });

  describe('shouldDeclareWar — strategic deterrence caution (#545 MR5)', () => {
    it('a war that would otherwise trigger is suppressed once the target has known strategic capability', () => {
      expect(shouldDeclareWar(aggressive, -10, 1.05, 12, true, true, false, 0)).toBe(true);
      expect(shouldDeclareWar(aggressive, -10, 1.05, 12, true, true, true, 0.15)).toBe(false);
    });

    it('a zero caution weight is a no-op even against a known-capability target', () => {
      expect(shouldDeclareWar(aggressive, -10, 1.05, 12, true, true, true, 0)).toBe(true);
    });

    it('caution never grants immunity — a sufficiently motivated AI still declares war', () => {
      expect(shouldDeclareWar(aggressive, -10, 3.0, 12, true, true, true, 0.15)).toBe(true);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-personality.test.ts`
Expected: FAIL (too many arguments passed to a 6-param function, or wrong boolean results since the extra args are currently ignored/erroring)

- [ ] **Step 3: Implement**

In `src/ai/ai-personality.ts`, replace `shouldDeclareWar`:

```ts
export function shouldDeclareWar(
  personality: PersonalityTraits,
  relationship: number,
  militaryAdvantage: number,
  currentTurn: number,
  hasMetTarget: boolean,
  hasBorderPressure: boolean,
  targetHasKnownStrategicCapability: boolean,
  strategicDeterrenceCautionWeight: number,
): boolean {
  if (!hasMetTarget) return false;
  if (relationship > 30) return false;
  if (currentTurn <= 5) {
    return hasBorderPressure
      && relationship <= -80
      && militaryAdvantage >= 2
      && personality.warLikelihood >= 0.8;
  }
  const warScore = personality.warLikelihood * militaryAdvantage;
  const peacePressure = Math.max(0, relationship) / 100;
  // #545 MR5 spec §9: known strategic capability raises the bar, it never
  // blocks war outright -- caller passes 0 when the target's capability is
  // unknown, so this is a strict no-op for every pre-MR5 call site.
  const cautionPenalty = targetHasKnownStrategicCapability ? strategicDeterrenceCautionWeight : 0;
  return warScore > (0.8 + peacePressure + cautionPenalty);
}
```

- [ ] **Step 4: Run tests to verify they pass, then type-check**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-personality.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: FAILS at this point — `ai-diplomacy.ts`'s call to `shouldDeclareWar` still passes only 6 arguments. This is expected; Task 4 fixes it. Confirm the *only* build errors are in `ai-diplomacy.ts` (no other stray callers) before moving on — this is the "grep every caller" check from the Global Constraints section, now verified by the compiler itself.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-personality.ts tests/ai/ai-personality.test.ts
git commit -m "feat(#545): shouldDeclareWar deterrence-caution term (MR5 Task 3)"
```

---

### Task 4: Thread deterrence caution through `evaluateDiplomacy` and `basic-ai.ts`

**Files:**
- Modify: `src/ai/ai-diplomacy.ts`
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/ai/ai-diplomacy.test.ts`

**Interfaces:**
- Consumes: `hasKnownStrategicCapability` (Task 1), `shouldDeclareWar`'s new signature (Task 3), `OPPONENT_CHALLENGE_PROFILES`/`resolveOpponentChallenge` (Task 2 + existing `@/core/opponent-challenge`).
- Produces: `DiplomaticContext.targetHasKnownStrategicCapability: boolean`; `evaluateDiplomacy(..., contextByCiv, strategicDeterrenceCautionWeight: number)`.

**This completes the build fix Task 3 left dangling — run `yarn build` again at the end of this task.**

- [ ] **Step 1: Update the existing tests and write the new failing test**

In `tests/ai/ai-diplomacy.test.ts`, every `contextByCiv` object literal in the 4 existing `describe('evaluateDiplomacy', ...)` tests needs `targetHasKnownStrategicCapability: false` added, and every `evaluateDiplomacy(...)` call needs a trailing `0` argument:

```ts
describe('evaluateDiplomacy', () => {
  it('does not declare war on turn 1 against an unmet or low-pressure rival', () => {
    const decisions = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -60 } }),
      [],
      1,
      { player: strength(10) },
      strength(100),
      1,
      { player: { hasMet: false, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
    );

    expect(decisions.find(d => d.action === 'declare_war')).toBeUndefined();
  });

  it('treats a missing perception context as unmet', () => {
    const decisions = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -100 } }),
      [],
      4,
      { player: strength(10) },
      strength(100),
      20,
      {},
      0,
    );

    expect(decisions.find(decision => decision.action === 'declare_war')).toBeUndefined();
  });

  it('does not sign treaties with an unmet civilization', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 80 } }),
      [],
      4,
      { player: strength(40) },
      strength(40),
      20,
      { player: { hasMet: false, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
    );

    expect(decisions).toEqual([]);
  });

  it('compares both civilizations through the same midpoint contract', () => {
    const decisions = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -60 } }),
      [],
      4,
      { player: strength(120) },
      strength(40),
      20,
      { player: { hasMet: true, hasBorderPressure: true, targetHasKnownStrategicCapability: false } },
      0,
    );

    expect(decisions.find(decision => decision.action === 'declare_war')).toBeUndefined();
  });

  it('known strategic capability on the target suppresses a war that would otherwise trigger (#545 MR5)', () => {
    const noCaution = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -60 } }),
      [],
      4,
      { player: strength(105) },
      strength(100),
      20,
      { player: { hasMet: true, hasBorderPressure: true, targetHasKnownStrategicCapability: false } },
      0,
    );
    expect(noCaution.find(d => d.action === 'declare_war')).toBeDefined();

    const withCaution = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -60 } }),
      [],
      4,
      { player: strength(105) },
      strength(100),
      20,
      { player: { hasMet: true, hasBorderPressure: true, targetHasKnownStrategicCapability: true } },
      0.15,
    );
    expect(withCaution.find(d => d.action === 'declare_war')).toBeUndefined();
  });
});
```

Verify the new test's numbers: `advantage = 100/105 ≈ 0.952`, `warScore = 0.9 * 0.952 ≈ 0.857` (aggressivePersonality.warLikelihood is `0.9`), `relationship -60` so `peacePressure = 0`. `0.857 > 0.8` → declares war with no caution. `0.857 > 0.95` → false with caution. Matches the assertions above.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-diplomacy.test.ts`
Expected: FAIL (wrong argument count / TS error)

- [ ] **Step 3: Implement `ai-diplomacy.ts`**

```ts
export interface DiplomaticContext {
  hasMet: boolean;
  hasBorderPressure: boolean;
  // #545 MR5: does this civ know the potential war target has strategic
  // (nuclear) capability -- see hasKnownStrategicCapability.
  targetHasKnownStrategicCapability: boolean;
}

export function evaluateDiplomacy(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  completedTechs: string[],
  era: number,
  militaryStrengths: Record<string, MilitaryStrengthEstimate>,
  selfStrength: MilitaryStrengthEstimate,
  currentTurn: number,
  contextByCiv: Record<string, DiplomaticContext>,
  strategicDeterrenceCautionWeight: number,
): DiplomaticDecision[] {
  const decisions: DiplomaticDecision[] = [];

  for (const civId of Object.keys(diplomacy.relationships)) {
    const actions = getAvailableActions(diplomacy, civId, completedTechs, era);
    const relationship = getRelationship(diplomacy, civId);
    const theirStrength = militaryStrengths[civId]?.midpoint ?? 0;
    const ownStrength = selfStrength.midpoint;
    const advantage = ownStrength > 0 && theirStrength > 0
      ? ownStrength / theirStrength
      : 1;

    if (isAtWar(diplomacy, civId)) {
      if (advantage < 0.7 || relationship > -20) {
        decisions.push({ action: 'request_peace', targetCiv: civId });
      }
    } else {
      const context = contextByCiv[civId]
        ?? { hasMet: false, hasBorderPressure: false, targetHasKnownStrategicCapability: false };
      if (!context.hasMet) continue;
      if (actions.includes('declare_war') && shouldDeclareWar(
        personality,
        relationship,
        advantage,
        currentTurn,
        context.hasMet,
        context.hasBorderPressure,
        context.targetHasKnownStrategicCapability,
        strategicDeterrenceCautionWeight,
      )) {
        decisions.push({ action: 'declare_war', targetCiv: civId });
        continue;
      }

      if (actions.includes('alliance') && relationship > 50) {
        decisions.push({ action: 'alliance', targetCiv: civId });
      } else if (actions.includes('trade_agreement') && relationship > 10) {
        decisions.push({ action: 'trade_agreement', targetCiv: civId });
      } else if (actions.includes('non_aggression_pact') && relationship > 0 && personality.diplomacyFocus > 0.4) {
        decisions.push({ action: 'non_aggression_pact', targetCiv: civId });
      }
    }
  }

  return decisions;
}
```

- [ ] **Step 4: Update `basic-ai.ts`**

Add two imports near the top (with the other `@/core` / `@/systems` imports):

```ts
import { OPPONENT_CHALLENGE_PROFILES, resolveOpponentChallenge } from '@/core/opponent-challenge';
import { hasKnownStrategicCapability } from '@/systems/strategic-arsenal-system';
```

In the diplomacy block (around line 974 in the current file), change the `diplomacyContext` type and its per-civ population:

```ts
    const diplomacyContext: Record<string, { hasMet: boolean; hasBorderPressure: boolean; targetHasKnownStrategicCapability: boolean }> = {};
    for (const otherId of perception.knownCivIds) {
      const otherCities = perception.knownCities
        .filter(city => city.owner === otherId && city.position !== null);
      const ownCities = civ.cities
        .map(id => newState.cities[id])
        .filter((city): city is City => city !== undefined);
      const ownUnits = civ.units
        .map(id => newState.units[id])
        .filter((unit): unit is Unit => unit !== undefined);
      const otherUnits = perception.units
        .filter(unit => unit.owner === otherId && unit.position !== null);

      const hasBorderPressure = ownUnits.some(unit =>
        otherCities.some(city => {
          const distance = newState.map.wrapsHorizontally
            ? wrappedHexDistance(unit.position, city.position!, newState.map.width)
            : hexDistance(unit.position, city.position!);
          return distance <= 3;
        }),
      ) || otherUnits.some(unit =>
        ownCities.some(city => {
          const distance = newState.map.wrapsHorizontally
            ? wrappedHexDistance(unit.position!, city.position, newState.map.width)
            : hexDistance(unit.position!, city.position);
          return distance <= 3;
        }),
      );

      diplomacyContext[otherId] = {
        hasMet: hasMetCivilization(newState, civId, otherId),
        hasBorderPressure,
        targetHasKnownStrategicCapability: hasKnownStrategicCapability(newState, civId, otherId),
      };
    }

    const strategicDeterrenceCautionWeight =
      OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(newState)].strategicDeterrenceCautionWeight;

    let decisions = evaluateDiplomacy(
      personality,
      civ.diplomacy,
      civ.techState.completed,
      newState.era,
      otherStrengths,
      selfStrength,
      newState.turn,
      diplomacyContext,
      strategicDeterrenceCautionWeight,
    );
```

- [ ] **Step 5: Run tests, then full build**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-diplomacy.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS (this clears the build failure Task 3 left open)

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS (full suite — this is the first point where every existing caller of the changed signatures has been updated)

- [ ] **Step 6: Commit**

```bash
git add src/ai/ai-diplomacy.ts src/ai/basic-ai.ts tests/ai/ai-diplomacy.test.ts
git commit -m "feat(#545): thread strategic deterrence caution through AI war scoring (MR5 Task 4)"
```

---

### Task 5: Diplomacy panel caution note

**Files:**
- Modify: `src/ui/diplomacy-panel.ts`
- Test: `tests/ui/diplomacy-panel.test.ts`

**Interfaces:**
- Consumes: `hasKnownStrategicCapability` (Task 1).

**`tests/ui/diplomacy-panel.test.ts` already imports `makeDiplomacyFixture` from `./helpers/diplomacy-fixture`**, which wraps `makeBreakawayFixture` (`tests/systems/helpers/breakaway-fixture.ts`). Passing `includeThirdCiv: true` adds a third major civ, `outsider` (name `'Outsider'`), owning `city-outsider` at `{ q: 6, r: 0 }` — already proven to render correctly by the existing `'omits unmet major civs from the panel'` test in this same file, which asserts `'Outsider'` is *absent* by default (the fixture grants it no visibility/contact evidence on its own). This task's new tests explicitly grant contact evidence via `knownCivilizations` — the same mechanism used throughout this plan — rather than relying on the fixture's own (unrelated, visibility-based) default.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `tests/ui/diplomacy-panel.test.ts`:

```ts
describe('strategic deterrence caution note (#545 MR5)', () => {
  it('shows a caution note for a not-at-war civ with known strategic capability', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeBreakaway: true, includeThirdCiv: true });
    state.civilizations.outsider.knownCivilizations = ['player'];
    state.builtNationalProjects = { 'player:manhattan_project': { civId: 'player', cityId: 'city-capital', eraBuilt: 10 } };

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('wary of your strategic capability');
  });

  it('omits the note when the civ has no known strategic capability', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeBreakaway: true, includeThirdCiv: true });
    state.civilizations.outsider.knownCivilizations = ['player'];
    // No builtNationalProjects -- Manhattan Project not built.

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).not.toContain('wary of your strategic capability');
  });

  it('omits the note for a civ currently at war (the caution factor only matters pre-war)', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeBreakaway: true, includeThirdCiv: true });
    state.civilizations.outsider.knownCivilizations = ['player'];
    state.builtNationalProjects = { 'player:manhattan_project': { civId: 'player', cityId: 'city-capital', eraBuilt: 10 } };
    state.civilizations.player.diplomacy.atWarWith = ['outsider', 'breakaway-city-border'];
    state.civilizations.outsider.diplomacy.atWarWith = ['player'];
    // The breakaway civ is always "met" via its own origin relation
    // (hasMetCivilizationByCurrentEvidence's breakaway.originOwnerId check),
    // so once player has Manhattan Project it independently qualifies for
    // the caution note too -- put it at war as well so this test's
    // whole-panel assertion isn't confounded by that unrelated row.
    // (Found and fixed during execution -- the first draft only put
    // `outsider` at war and the assertion failed because the breakaway
    // row's note was still showing.)
    state.civilizations['breakaway-city-border'].diplomacy.atWarWith = ['player'];

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).not.toContain('wary of your strategic capability');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/diplomacy-panel.test.ts`
Expected: FAIL (text not found)

- [ ] **Step 3: Implement**

Add the import, near the other `@/systems/*` imports at the top of `src/ui/diplomacy-panel.ts`:

```ts
import { hasKnownStrategicCapability } from '@/systems/strategic-arsenal-system';
```

Add a field to `CivRowData` (after `worldPressureDetailText`):

```ts
  strategicCautionNoteText: string | null;
```

In the row-building loop (after the `worldPressureLine`/send-aid block, before `civRows.push({...})`), compute it. The note reflects whether *this row's civ* is wary of the *player's* capability, so the arguments are `(state, civId, state.currentPlayer)` — `civId` is the viewer, `state.currentPlayer` is the civ whose capability might be known:

```ts
    // #545 MR5 spec §9: player-readable surfacing of the AI's own
    // deterrence-caution factor -- "no invisible number." Only meaningful
    // pre-war; a civ already at war has already crossed that threshold.
    const strategicCautionNoteText = (!atWar && hasKnownStrategicCapability(state, civId, state.currentPlayer))
      ? `${civ.name} is wary of your strategic capability.`
      : null;
```

Add `strategicCautionNoteText,` to the `civRows.push({...})` object (alongside `sendAidDisabledReason,`).

In the template-building loop, alongside `worldPressureDetailHtml` (after it, before `sendAidHtml`):

```ts
    const strategicCautionNoteHtml = row.strategicCautionNoteText
      ? `<div style="font-size:11px;color:#e8c170;margin-bottom:8px;" data-text="strategic-caution-${row.civIdx}"></div>`
      : '';
```

Add `${strategicCautionNoteHtml}` to the template string, alongside the other `${...Html}` insertions inside the name/status `<div>` block (after `${worldPressureDetailHtml}`, before `${treatyProposalsHtml}`).

In the `setText` block, alongside the other conditional `setText` calls:

```ts
    if (row.strategicCautionNoteText) {
      setText(`strategic-caution-${row.civIdx}`, row.strategicCautionNoteText);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/diplomacy-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/diplomacy-panel.ts tests/ui/diplomacy-panel.test.ts
git commit -m "feat(#545): diplomacy panel strategic-caution note (MR5 Task 5)"
```

---

### Task 6: `ai-strategic-doctrine.ts` — existential-threat gate

**Files:**
- Create: `src/ai/ai-strategic-doctrine.ts`
- Test: `tests/ai/ai-strategic-doctrine.test.ts` (new)

**Interfaces:**
- Consumes: `getCapitalCity` (`@/systems/capital-system`), `getLegalStrategicLaunchTargets` (`@/systems/strategic-launch-system`), `UNIT_DEFINITIONS` (`@/systems/unit-system`), `mapDistance` (`@/systems/hex-utils`), `isHostileOwnerTo` (`@/systems/owner-hostility`).
- Produces: `canAuthorizeVeteranFirstUse(state: GameState, civId: string): string | null`. Consumed by Task 7 (same file) and Task 8 (`basic-ai.ts`, indirectly via Task 7's `evaluateStrategicLaunchDecision`).

- [ ] **Step 1: Write the failing tests**

Create `tests/ai/ai-strategic-doctrine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { GameState, Civilization, Unit, City, HexCoord } from '@/core/types';
import { canAuthorizeVeteranFirstUse } from '@/ai/ai-strategic-doctrine';

const CAPITAL_POS: HexCoord = { q: 0, r: 0 };

function makeDiplomacy(atWarWith: string[] = []) {
  return {
    relationships: {}, treaties: [], events: [], atWarWith, treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
  };
}

function makeCiv(id: string, overrides: Partial<Civilization> = {}): Civilization {
  return {
    id, name: id, color: '#fff', isHuman: false, civType: 'generic',
    cities: [`${id}-capital`], units: [], gold: 0, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: makeDiplomacy(),
    ...overrides,
  } as Civilization;
}

function makeCity(id: string, owner: string, position: HexCoord, hp?: number): City {
  return { id, name: id, owner, position, buildings: [], hp } as unknown as City;
}

function makeUnit(id: string, owner: string, type: string, position: HexCoord): Unit {
  return {
    id, type: type as never, owner, position,
    movementPointsLeft: 1, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
  } as Unit;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1, era: 5, currentPlayer: 'p1',
    civilizations: {}, cities: {}, units: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [], gameOver: false, winner: null,
    settings: {} as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as GameState;
}

// Fully-satisfied baseline: capital critically damaged, a hostile warrior
// adjacent, no friendly land unit nearby, and a legal target (ai-2's own
// capital, in range with a silo, discovered, at war).
function makeExistentialThreatState(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    civilizations: {
      'ai-1': makeCiv('ai-1', {
        cities: ['ai-1-capital', 'ai-1-silo'],
        diplomacy: makeDiplomacy(['ai-2']),
        strategicArsenal: 1,
        visibility: { tiles: { '5,5': 'visible' }, lastSeen: {} },
      }),
      'ai-2': makeCiv('ai-2', { cities: ['ai-2-capital'] }),
    },
    cities: {
      'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 10),
      'ai-1-silo': makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100) as City & { buildings: string[] },
      'ai-2-capital': makeCity('ai-2-capital', 'ai-2', { q: 5, r: 5 }, 100),
    },
    units: {
      'hostile-1': makeUnit('hostile-1', 'ai-2', 'warrior', { q: 1, r: 0 }),
    },
    ...overrides,
  });
}

describe('canAuthorizeVeteranFirstUse (#545 MR5 §10)', () => {
  it('authorizes when capital HP is critical, a hostile land unit is adjacent, and no friendly relief is near', () => {
    const state = makeExistentialThreatState();
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBe('ai-2-capital');
  });

  it('does not authorize when capital HP is above the threshold', () => {
    const state = makeExistentialThreatState();
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    state.cities['ai-1-capital'] = { ...state.cities['ai-1-capital'], hp: 80 };
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('does not authorize when no hostile land unit is adjacent to the capital', () => {
    const state = makeExistentialThreatState({ units: {} });
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('does not authorize when a friendly combat land unit is near the capital (relief present)', () => {
    const state = makeExistentialThreatState({
      units: {
        'hostile-1': makeUnit('hostile-1', 'ai-2', 'warrior', { q: 1, r: 0 }),
        'friendly-1': makeUnit('friendly-1', 'ai-1', 'warrior', { q: 0, r: 2 }),
      },
    });
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('"friendly" means the endangered civ\'s own units only — an allied civ\'s unit does not count as relief', () => {
    const state = makeExistentialThreatState({
      civilizations: {
        'ai-1': makeCiv('ai-1', {
          cities: ['ai-1-capital', 'ai-1-silo'], diplomacy: makeDiplomacy(['ai-2']), strategicArsenal: 1,
          visibility: { tiles: { '5,5': 'visible' }, lastSeen: {} },
        }),
        'ai-2': makeCiv('ai-2', { cities: ['ai-2-capital'] }),
        'ai-3': makeCiv('ai-3', { cities: [] }),
      },
      units: {
        'hostile-1': makeUnit('hostile-1', 'ai-2', 'warrior', { q: 1, r: 0 }),
        'ally-1': makeUnit('ally-1', 'ai-3', 'warrior', { q: 0, r: 2 }),
      },
    });
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBe('ai-2-capital');
  });

  it('does not authorize when there is no legal target', () => {
    const state = makeExistentialThreatState();
    // No missile_silo building anywhere -- no platform, so getLegalStrategicLaunchTargets is empty.
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('excludes a minor civ from AI-authorized targets, even when the minor civ itself is the besieger', () => {
    // Deliberately does NOT reuse makeExistentialThreatState's default
    // units (an ai-2-owned unit) -- if it did, ai-1 would no longer be at
    // war with ai-2 in this test's overridden diplomacy, so
    // isHostileOwnerTo would already return false for that leftover unit
    // and this test would pass for the wrong reason (no threat detected at
    // all) without ever reaching the minor-civ exclusion this test is
    // named for. Instead, the besieger here is mc-1 itself -- a minor civ
    // unit adjacent to the capital -- which must still authorize nothing
    // because minor civs are never legal AI-authorized targets, not
    // because no threat was detected.
    const state = makeState({
      civilizations: {
        'ai-1': makeCiv('ai-1', {
          cities: ['ai-1-capital', 'ai-1-silo'], diplomacy: makeDiplomacy(['mc-1']), strategicArsenal: 1,
          visibility: { tiles: { '2,2': 'visible' }, lastSeen: {} },
        }),
      },
      cities: {
        'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 10),
        'ai-1-silo': { ...makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100), buildings: ['missile_silo'] } as City,
        'mc-1-city': makeCity('mc-1-city', 'mc-1', { q: 2, r: 2 }, 100),
      },
      minorCivs: {
        'mc-1': {
          id: 'mc-1', definitionId: 'mc-1', cityId: 'mc-1-city', units: ['mc-hostile-1'],
          diplomacy: makeDiplomacy(['ai-1']), activeQuests: {}, chainStatusByCiv: {},
          questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {}, isDestroyed: false,
          garrisonCooldown: 0, lastEraUpgrade: 0,
        },
      },
      units: {
        'mc-hostile-1': makeUnit('mc-hostile-1', 'mc-1', 'warrior', { q: 1, r: 0 }),
      },
    });
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('never strikes an unrelated atWarWith civ that is not the one besieging the capital (pacifist-safety invariant)', () => {
    // ai-1 is at war with BOTH ai-2 (the actual besieger, adjacent to the
    // capital) and ai-4 (an unrelated war -- e.g. ai-4 never attacked
    // anyone and has no units anywhere near ai-1's capital). Only ai-2's
    // city may ever be selected; ai-4's must never be struck just because
    // it happens to have a legal target and appears in atWarWith.
    const state = makeExistentialThreatState({
      civilizations: {
        'ai-1': makeCiv('ai-1', {
          cities: ['ai-1-capital', 'ai-1-silo'],
          diplomacy: makeDiplomacy(['ai-2', 'ai-4']),
          strategicArsenal: 1,
          visibility: { tiles: { '5,5': 'visible', '9,9': 'visible' }, lastSeen: {} },
        }),
        'ai-2': makeCiv('ai-2', { cities: ['ai-2-capital'] }),
        'ai-4': makeCiv('ai-4', { cities: ['ai-4-capital'] }),
      },
      cities: {
        'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 10),
        'ai-1-silo': makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100),
        'ai-2-capital': makeCity('ai-2-capital', 'ai-2', { q: 5, r: 5 }, 100),
        'ai-4-capital': makeCity('ai-4-capital', 'ai-4', { q: 9, r: 9 }, 100),
      },
      // Only ai-2 has a unit anywhere -- ai-4 poses no threat at all.
      units: {
        'hostile-1': makeUnit('hostile-1', 'ai-2', 'warrior', { q: 1, r: 0 }),
      },
    });
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBe('ai-2-capital');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-strategic-doctrine.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

Create `src/ai/ai-strategic-doctrine.ts`:

```ts
import type { City, GameState, Unit } from '@/core/types';
import { getCapitalCity } from '@/systems/capital-system';
import { getLegalStrategicLaunchTargets } from '@/systems/strategic-launch-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { mapDistance } from '@/systems/hex-utils';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

// #545 MR5 spec §10: illustrative values made concrete during MR5 planning.
const VETERAN_FIRST_USE_CAPITAL_HP_THRESHOLD = 20;
const VETERAN_FIRST_USE_RELIEF_RADIUS = 3;

function isCombatLandUnit(unit: Unit): boolean {
  const definition = UNIT_DEFINITIONS[unit.type];
  // domain is optional; absent means land (same convention isCombatWarship
  // in basic-ai.ts relies on for the naval side).
  return (definition?.domain === undefined || definition.domain === 'land')
    && (definition?.strength ?? 0) > 0;
}

// Returns the set of civ ids that actually own a hostile land unit adjacent
// to the capital -- NOT just a boolean. Target selection below must strike
// one of THESE civs, never an arbitrary atWarWith entry: an AI could
// legitimately be at war with a second, unrelated (and possibly pacifist)
// civ at the same time its capital is besieged by a different one, and
// only the actual besieger may ever be struck by this gate. This is what
// keeps a human who never builds arsenal and never attacks anyone
// structurally un-nukeable even while at war with a veteran AI under siege
// from someone else.
function getCapitalThreateningOwnerIds(state: GameState, civId: string, capital: City): Set<string> {
  const owners = new Set<string>();
  for (const unit of Object.values(state.units)) {
    if (
      isCombatLandUnit(unit)
      && isHostileOwnerTo(state, civId, unit.owner)
      && mapDistance(state.map, unit.position, capital.position) === 1
    ) {
      owners.add(unit.owner);
    }
  }
  return owners;
}

// "Friendly" means the endangered civ's OWN units only -- no alliance-aware
// relief detection exists in this codebase (#545 MR5 design doc finding #5).
function hasFriendlyReliefNearCapital(state: GameState, civId: string, capital: City): boolean {
  return Object.values(state.units).some(unit =>
    unit.owner === civId
    && isCombatLandUnit(unit)
    && mapDistance(state.map, unit.position, capital.position) <= VETERAN_FIRST_USE_RELIEF_RADIUS,
  );
}

/**
 * Every legal strike target for civId, grouped by owner civ, excluding minor
 * civs (city-states) -- #545 MR5 design doc finding #3: the doctrine models
 * deterrence between major nuclear powers, not "may a nuke ever be used on
 * anyone I'm at war with." MR4's human-facing launch flow is intentionally
 * left unchanged; this exclusion is new AI-doctrine-only behavior.
 */
function getMajorCivLegalTargetsByOwner(state: GameState, civId: string): Map<string, City[]> {
  const byOwner = new Map<string, City[]>();
  for (const city of getLegalStrategicLaunchTargets(state, civId)) {
    if (!(city.owner in state.civilizations)) continue;
    const list = byOwner.get(city.owner) ?? [];
    list.push(city);
    byOwner.set(city.owner, list);
  }
  return byOwner;
}

// #545 MR5 design doc finding #4: prefer the opponent's capital for
// narrative weight; otherwise the first legal target. Deliberately not a
// scoring system (YAGNI).
function pickPreferredTarget(state: GameState, targets: City[], opponentCivId: string): City {
  const capital = getCapitalCity(state, opponentCivId);
  return targets.find(city => city.id === capital?.id) ?? targets[0];
}

/**
 * #545 MR5 spec §10: Veteran-only existential-threat gate. All three
 * conditions required -- own capital HP below threshold, a hostile land unit
 * adjacent to it, and no friendly (own) combat land unit within relief
 * radius. Deterministic, no RNG. Callers decide whether to invoke this based
 * on difficulty -- this function itself does not branch on OpponentChallenge.
 * The authorized target is always one of the civs actually threatening the
 * capital (see getCapitalThreateningOwnerIds) -- never an unrelated
 * atWarWith civ that happens to have a legal target.
 */
export function canAuthorizeVeteranFirstUse(state: GameState, civId: string): string | null {
  const capital = getCapitalCity(state, civId);
  if (!capital) return null;
  if ((capital.hp ?? 100) >= VETERAN_FIRST_USE_CAPITAL_HP_THRESHOLD) return null;

  const threateningOwnerIds = getCapitalThreateningOwnerIds(state, civId, capital);
  if (threateningOwnerIds.size === 0) return null;
  if (hasFriendlyReliefNearCapital(state, civId, capital)) return null;

  const civ = state.civilizations[civId];
  if (!civ) return null;
  const targetsByOwner = getMajorCivLegalTargetsByOwner(state, civId);
  for (const opponentId of civ.diplomacy.atWarWith) {
    if (!threateningOwnerIds.has(opponentId)) continue;
    const targets = targetsByOwner.get(opponentId);
    if (targets && targets.length > 0) {
      return pickPreferredTarget(state, targets, opponentId).id;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-strategic-doctrine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-strategic-doctrine.ts tests/ai/ai-strategic-doctrine.test.ts
git commit -m "feat(#545): veteran existential-threat first-use gate (MR5 Task 6)"
```

---

### Task 7: `ai-strategic-doctrine.ts` — retaliation + the single entry point

**Files:**
- Modify: `src/ai/ai-strategic-doctrine.ts`
- Modify: `tests/ai/ai-strategic-doctrine.test.ts`

**Interfaces:**
- Consumes: `canAuthorizeVeteranFirstUse` (Task 6, same file), `isStrategicStrikeRetaliation` (`@/systems/strategic-launch-system`), `OPPONENT_CHALLENGE_PROFILES` (Task 2), `getMajorCivLegalTargetsByOwner`/`pickPreferredTarget` (Task 6, same file, not exported — internal reuse).
- Produces: `evaluateStrategicLaunchDecision(state: GameState, civId: string, challenge: OpponentChallenge, rng: () => number): string | null`. Consumed by Task 8 (`basic-ai.ts`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-strategic-doctrine.test.ts` (extend the existing import line to add `evaluateStrategicLaunchDecision`, and add `OpponentChallenge` to the type import):

```ts
import { canAuthorizeVeteranFirstUse, evaluateStrategicLaunchDecision } from '@/ai/ai-strategic-doctrine';
import type { GameState, Civilization, Unit, City, HexCoord, OpponentChallenge } from '@/core/types';
```

```ts
// A civ struck by ai-2 before, currently at war with ai-2, with a legal
// target and no existential threat of its own (so first-use never fires) --
// isolates the retaliation path.
function makeRetaliationEligibleState(): GameState {
  return makeState({
    civilizations: {
      'ai-1': makeCiv('ai-1', {
        cities: ['ai-1-capital', 'ai-1-silo'],
        diplomacy: { ...makeDiplomacy(['ai-2']), strategicStrikesReceivedFrom: ['ai-2'] },
        strategicArsenal: 1,
        visibility: { tiles: { '5,5': 'visible' }, lastSeen: {} },
      }),
      'ai-2': makeCiv('ai-2', { cities: ['ai-2-capital'] }),
    },
    cities: {
      'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 100),
      'ai-1-silo': { ...makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100), buildings: ['missile_silo'] } as City,
      'ai-2-capital': makeCity('ai-2-capital', 'ai-2', { q: 5, r: 5 }, 100),
    },
  });
}

describe('evaluateStrategicLaunchDecision (#545 MR5 §10)', () => {
  it('explorer/standard never authorize first use, even under existential-threat conditions', () => {
    const state = makeExistentialThreatState();
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    const rng = () => 1; // never wins a probability roll
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'explorer', rng)).toBeNull();
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng)).toBeNull();
  });

  it('veteran authorizes first use via the existential gate, independent of the retaliation roll', () => {
    const state = makeExistentialThreatState();
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    const rng = () => 1; // would fail any retaliation roll -- proves this path is the gate, not RNG
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'veteran', rng))
      .toBe(canAuthorizeVeteranFirstUse(state, 'ai-1'));
  });

  it('retaliation-eligible civ launches when the willingness roll succeeds', () => {
    const state = makeRetaliationEligibleState();
    const rng = () => 0; // always "wins" (0 < any positive willingness)
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng)).toBe('ai-2-capital');
  });

  it('retaliation-eligible civ does not launch when the willingness roll fails', () => {
    const state = makeRetaliationEligibleState();
    const rng = () => 0.999999; // above every difficulty's willingness (all < 1)
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng)).toBeNull();
  });

  it('a civ that was never struck by its war opponent is not retaliation-eligible, regardless of RNG', () => {
    const state = makeExistentialThreatState(); // atWarWith ai-2, but no strategicStrikesReceivedFrom
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    const rng = () => 0; // would always "win" if eligibility were ignored
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng)).toBeNull();
  });

  it('bounded correctly across multiple war opponents -- only the retaliation-eligible one is ever struck, even when a non-eligible opponent is checked first', () => {
    // A naive review of the first draft found this test's original form
    // (a third civ with a legal target but NOT in atWarWith) doesn't
    // actually prove anything: getStrategicLaunchLegality's own isAtWar
    // check already makes a non-warred civ's city illegal, so a target on
    // it can never exist in the first place -- the assertion passed
    // trivially, without ever exercising code this task added. This
    // version instead puts ai-3 IN atWarWith (so it has a genuinely legal
    // target) and iterates it BEFORE the actually-eligible ai-2, so the
    // only way the test can pass is if isStrategicStrikeRetaliation's gate
    // is actually being checked per-opponent, not just "first legal
    // target wins."
    const state = makeRetaliationEligibleState(); // ai-1 struck by ai-2 before -> ai-2 is retaliation-eligible
    state.civilizations['ai-1'].diplomacy.atWarWith = ['ai-3', 'ai-2']; // ai-3 iterated first
    state.civilizations['ai-3'] = makeCiv('ai-3', { cities: ['ai-3-capital'] }); // never struck ai-1
    state.cities['ai-3-capital'] = makeCity('ai-3-capital', 'ai-3', { q: 6, r: 6 }, 100);
    (state.civilizations['ai-1'].visibility as { tiles: Record<string, string> }).tiles['6,6'] = 'visible';
    const rng = () => 0; // always "wins" if reached -- proves ai-3 is skipped on eligibility, not luck
    const result = evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng);
    expect(result).toBe('ai-2-capital');
  });

  it('play-styles invariant (#545 MR5 design doc finding #7): a civ that never built arsenal and never struck first is never targeted, at any difficulty', () => {
    // ai-9 is at war with ai-1 (so it has a genuinely legal target -- a
    // discovered city, in range, with ai-1 at war with it) but has zero
    // strategicArsenal, has never appeared in any civ's
    // strategicStrikesReceivedFrom, and poses no adjacency threat to
    // ai-1's capital (which also isn't critically damaged). Deliberately
    // NOT reusing makeRetaliationEligibleState's ai-2 alongside ai-9 --
    // an earlier draft of this test did that, and ai-2 (genuinely
    // retaliation-eligible) was always returned first regardless of
    // whether ai-9's exclusion logic worked at all, making the assertion
    // vacuous. Here ai-9 is the ONLY war opponent, so a null result is
    // the only way this test can pass, and only if eligibility is
    // actually being checked.
    const state = makeState({
      civilizations: {
        'ai-1': makeCiv('ai-1', {
          cities: ['ai-1-capital', 'ai-1-silo'],
          diplomacy: makeDiplomacy(['ai-9']),
          strategicArsenal: 1,
          visibility: { tiles: { '7,7': 'visible' }, lastSeen: {} },
        }),
        'ai-9': makeCiv('ai-9', { cities: ['ai-9-capital'], strategicArsenal: 0 }),
      },
      cities: {
        'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 100),
        'ai-1-silo': { ...makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100), buildings: ['missile_silo'] } as City,
        'ai-9-capital': makeCity('ai-9-capital', 'ai-9', { q: 7, r: 7 }, 100),
      },
    });

    const alwaysWinRng = () => 0; // maximizes the chance a bug would surface
    for (const challenge of ['explorer', 'standard', 'veteran'] as const) {
      expect(evaluateStrategicLaunchDecision(state, 'ai-1', challenge, alwaysWinRng)).toBeNull();
    }
  });
});
```

Note: `hasDiscoveredCity` (used internally by `getStrategicLaunchLegality`) reads `civ.visibility` keyed by `hexKey(position)`; the fixtures above use the literal `'q,r'` string form directly as a shorthand matching this suite's sibling file (`strategic-launch-system.test.ts`) convention. Confirm the exact `hexKey` format against `src/systems/hex-utils.ts` before running — if it differs from `'q,r'`, use the real `hexKey({ q, r })` helper in the fixture instead of a hardcoded string.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-strategic-doctrine.test.ts`
Expected: FAIL (`evaluateStrategicLaunchDecision` not exported)

- [ ] **Step 3: Implement**

Add to `src/ai/ai-strategic-doctrine.ts` (new imports at top, new function at bottom):

```ts
import type { City, GameState, OpponentChallenge, Unit } from '@/core/types';
import { getCapitalCity } from '@/systems/capital-system';
import { getLegalStrategicLaunchTargets, isStrategicStrikeRetaliation } from '@/systems/strategic-launch-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { mapDistance } from '@/systems/hex-utils';
import { isHostileOwnerTo } from '@/systems/owner-hostility';
import { OPPONENT_CHALLENGE_PROFILES } from '@/core/opponent-challenge';
```

```ts
/**
 * #545 MR5 spec §10: the ONLY entry point basic-ai.ts should call for an AI
 * launch decision -- never resolveStrategicStrike, never
 * canAuthorizeVeteranFirstUse directly from outside this module. Veteran
 * tries the deterministic existential-threat gate first; every difficulty
 * (including veteran, if the gate didn't authorize) then checks retaliation:
 * bounded to atWarWith major civs with a legal target, gated by
 * isStrategicStrikeRetaliation, resolved by a deterministic per-turn roll
 * against the difficulty's strategicLaunchRetaliationWillingness.
 */
export function evaluateStrategicLaunchDecision(
  state: GameState,
  civId: string,
  challenge: OpponentChallenge,
  rng: () => number,
): string | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;

  if (challenge === 'veteran') {
    const firstUseTarget = canAuthorizeVeteranFirstUse(state, civId);
    if (firstUseTarget) return firstUseTarget;
  }

  const profile = OPPONENT_CHALLENGE_PROFILES[challenge];
  const targetsByOwner = getMajorCivLegalTargetsByOwner(state, civId);
  for (const opponentId of civ.diplomacy.atWarWith) {
    const targets = targetsByOwner.get(opponentId);
    if (!targets || targets.length === 0) continue;
    if (!isStrategicStrikeRetaliation(state, civId, opponentId)) continue;
    if (rng() < profile.strategicLaunchRetaliationWillingness) {
      return pickPreferredTarget(state, targets, opponentId).id;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-strategic-doctrine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-strategic-doctrine.ts tests/ai/ai-strategic-doctrine.test.ts
git commit -m "feat(#545): evaluateStrategicLaunchDecision retaliation path (MR5 Task 7)"
```

---

### Task 8: Wire the AI doctrine into `basic-ai.ts`

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/ai/basic-ai.test.ts`

**Interfaces:**
- Consumes: `evaluateStrategicLaunchDecision` (Task 7), `executeStrategicLaunch` (`@/systems/strategic-launch-execution-system`, MR4), `getEligibleStrategicLaunchPlatforms` (`@/systems/strategic-launch-system`, MR2), `createRng` (already imported), `resolveOpponentChallenge` (already imported from Task 4).
- Produces: the AI's own strikes now flow through `bus.emit('city:strategic-strike', ...)` with a third field, `actorCivId` — Task 9 extends the event type to accept it; until Task 9 lands, this task's own emit call will show a TS error for the extra property, which is expected and resolved by Task 9. (Both tasks touch `basic-ai.ts`'s same block; doing Task 8 first, accepting a transient build error, keeps each task's diff minimal and focused on one concern.)

- [ ] **Step 1: Write the failing test**

Add to `tests/ai/basic-ai.test.ts`:

```ts
import { processAITurn } from '@/ai/basic-ai';
import { EventBus } from '@/core/event-bus';

describe('AI strategic launch doctrine (#545 MR5)', () => {
  it('a veteran AI under existential threat launches a real strike via processAITurn', () => {
    const state = createNewGame(undefined, 'mr5-veteran-first-use', 'small');
    state.opponentChallenge = 'veteran';
    const aiId = 'ai-1';
    const enemyId = 'ai-2';
    state.civilizations[aiId].cities = ['ai-1-capital', 'ai-1-silo'];
    state.civilizations[aiId].strategicArsenal = 1;
    state.civilizations[aiId].diplomacy.atWarWith = [enemyId];
    state.civilizations[enemyId] = {
      ...state.civilizations[aiId],
      id: enemyId, name: 'Enemy', cities: ['enemy-capital'], strategicArsenal: 0,
      diplomacy: { ...state.civilizations[aiId].diplomacy, atWarWith: [aiId] },
    };
    state.cities['ai-1-capital'] = { id: 'ai-1-capital', name: 'Capital', owner: aiId, position: { q: 0, r: 0 }, buildings: [], hp: 10 } as any;
    state.cities['ai-1-silo'] = { id: 'ai-1-silo', name: 'Silo', owner: aiId, position: { q: 0, r: 1 }, buildings: ['missile_silo'] } as any;
    state.cities['enemy-capital'] = { id: 'enemy-capital', name: 'EnemyCapital', owner: enemyId, position: { q: 5, r: 5 } } as any;
    state.civilizations[aiId].visibility.tiles[hexKey({ q: 5, r: 5 })] = 'visible';
    state.units['hostile-adjacent'] = createUnit('warrior', enemyId, { q: 1, r: 0 }, state.idCounters);

    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('city:strategic-strike', payload => events.push(payload));

    const result = processAITurn(state, aiId, bus);

    expect(result.cities['enemy-capital'].hp).toBe(1);
    expect(result.civilizations[aiId].strategicArsenal).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ cityId: 'enemy-capital', recipientCivId: enemyId, actorCivId: aiId });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/basic-ai.test.ts -t "veteran AI under existential threat"`
Expected: FAIL (`enemy-capital.hp` still 100 / no strike happened — the call site doesn't exist yet)

- [ ] **Step 3: Implement**

Add two imports to `src/ai/basic-ai.ts` (alongside the Task 4 imports):

```ts
import { getEligibleStrategicLaunchPlatforms } from '@/systems/strategic-launch-system';
import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';
import { evaluateStrategicLaunchDecision } from './ai-strategic-doctrine';
```

Insert, immediately before the closing `}` of the `if (civ.diplomacy) { ... }` block (right after the league-invitation loop, before the `// --- Minor civ diplomacy ---` comment):

```ts
    // #545 MR5: AI strategic-launch doctrine. evaluateStrategicLaunchDecision
    // is the only decision function; executeStrategicLaunch (MR4) is the
    // only execution entry point -- never resolveStrategicStrike directly.
    // Cheap guard first: skip doctrine work entirely for the many civs with
    // no launch platform.
    if (getEligibleStrategicLaunchPlatforms(newState, civId).length > 0) {
      const launchRng = createRng(`ai-strategic-launch-${civId}-${newState.turn}`);
      const targetCityId = evaluateStrategicLaunchDecision(
        newState, civId, resolveOpponentChallenge(newState), launchRng,
      );
      if (targetCityId) {
        const targetCivId = newState.cities[targetCityId]?.owner;
        const result = executeStrategicLaunch(newState, civId, targetCityId);
        if (result.ok && targetCivId) {
          newState = result.state;
          bus.emit('city:strategic-strike', {
            cityId: targetCityId,
            recipientCivId: targetCivId,
            actorCivId: civId,
            goldLost: result.goldLost,
          });
        }
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/basic-ai.test.ts -t "veteran AI under existential threat"`
Expected: PASS *once Task 9's `actorCivId` field exists on `GameEvents['city:strategic-strike']`* — until then this shows a TypeScript error on the `bus.emit` call's extra property (`actorCivId` not assignable). This is the expected, intentional transient state described in this task's Interfaces section. Confirm the *test's runtime assertions* pass (vitest doesn't type-check) even though `yarn build` will fail until Task 9 lands — do not attempt to work around this by skipping the field; Task 9 is next.

- [ ] **Step 5: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "feat(#545): wire AI strategic launch doctrine into basic-ai.ts turn loop (MR5 Task 8)"
```

---

### Task 9: Consolidate strike notification/SFX (event payload + controllers + registrar)

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/app/controllers/panel-actions-controller.ts`
- Modify: `src/app/controllers/selection-controller.ts`
- Modify: `src/presentation/register-strategic-strike-presentation.ts`
- Test: `tests/presentation/register-strategic-strike-presentation.test.ts`
- Test: `tests/app/controllers/panel-actions-controller.test.ts`

**Interfaces:**
- Consumes: `SFX.strategicStrike` (`@/audio/sfx`), `hasMetCivilization` (`@/systems/discovery-system`).
- Produces: `GameEvents['city:strategic-strike']` gains `actorCivId: string` — this is the field Task 8's emit call already relies on. `SFX.strategicStrike()` is called from exactly one place after this task (the registrar), never from either controller.

**This closes the build gap Task 8 intentionally left open — run `yarn build` at the end of this task and confirm it passes clean.**

- [ ] **Step 1: Update the event type**

In `src/core/types.ts`, find `'city:strategic-strike': { cityId: string; recipientCivId: string; goldLost: number };` and change it to:

```ts
  'city:strategic-strike': { cityId: string; recipientCivId: string; actorCivId: string; goldLost: number };
```

- [ ] **Step 2: Update both controllers**

In `src/app/controllers/panel-actions-controller.ts`, inside `onPrepareStrategicLaunch`'s `onConfirmLaunch` callback, remove the direct `SFX.strategicStrike()` line and add `actorCivId` to the emit call:

```ts
          onConfirmLaunch: targetCityId => {
            const targetCivId = deps.session.getState().cities[targetCityId]?.owner;
            const result = executeStrategicLaunch(deps.session.getState(), launchingCity.owner, targetCityId);
            if (result.ok && targetCivId) {
              deps.session.commit(result.state);
              deps.renderLoop.setGameState(deps.session.getState());
              deps.showNotification('Strategic strike launched.', 'warning');
              deps.bus.emit('city:strategic-strike', { cityId: targetCityId, recipientCivId: targetCivId, actorCivId: launchingCity.owner, goldLost: result.goldLost });
            }
          },
```

(The `SFX.strategicStrike();` line that previously sat between `deps.renderLoop.setGameState(...)` and `deps.showNotification(...)` is deleted — nothing replaces it here; Step 4 below makes the registrar responsible for it.)

Apply the identical change in `src/app/controllers/selection-controller.ts`'s `onPrepareStrategicLaunch`'s `onConfirmLaunch` callback:

```ts
            onConfirmLaunch: targetCityId => {
              const targetCivId = session.getState().cities[targetCityId]?.owner;
              const result = executeStrategicLaunch(session.getState(), unit.owner, targetCityId);
              if (result.ok && targetCivId) {
                session.commit(result.state);
                deps.renderLoop.setGameState(session.getState());
                deps.showNotification('Strategic strike launched.', 'warning');
                deps.bus.emit('city:strategic-strike', { cityId: targetCityId, recipientCivId: targetCivId, actorCivId: unit.owner, goldLost: result.goldLost });
              }
            },
```

Check whether either file's `SFX` import becomes unused after removing these calls — if `SFX.strategicStrike()` was the only `SFX.*` usage in that file, remove the now-unused import; if the file calls other `SFX.*` methods elsewhere (e.g. `SFX.combat()`), keep the import.

- [ ] **Step 3: Write the failing/updated tests for the controllers**

In `tests/app/controllers/panel-actions-controller.test.ts`, extend the existing `'Prepare Strategic Launch (#545 MR4)...'` test (do not add a new test — this is the same scenario, just asserting more):

```ts
    it('Prepare Strategic Launch (#545 MR4/MR5): opens the flow, and a confirmed launch commits a real strike without calling SFX directly', () => {
      const { state, aiCivId } = makeFixture('city-panel-strategic-launch');
      const targetPos = { q: 1, r: 1 };
      state.cities['silo'] = makeCity('silo', { buildings: ['missile_silo'] });
      state.cities['target'] = makeCity('target', { owner: aiCivId, position: targetPos });
      state.civilizations[aiCivId].cities = ['target'];
      state.civilizations.player.strategicArsenal = 1;
      state.civilizations.player.diplomacy.atWarWith = [aiCivId];
      state.civilizations.player.visibility = { tiles: { [hexKey(targetPos)]: 'visible' }, lastSeen: {} };
      const { deps, controller } = build(state);
      const strategicStrikeSpy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
      const emitted: unknown[] = [];
      deps.bus.on('city:strategic-strike', payload => emitted.push(payload));

      controller.openCityPanelForCity(state.cities['silo']);
      const cityPanelOptions = mockedCallArg<{ onPrepareStrategicLaunch: (cityId: string) => void }>(createCityPanel, 0, 3);
      cityPanelOptions.onPrepareStrategicLaunch('silo');

      const flowOptions = mockedCallArg<{ onConfirmLaunch: (targetCityId: string) => void }>(createStrategicLaunchFlow, 0, 3);
      flowOptions.onConfirmLaunch('target');

      expect(deps.session.getState().cities.target.hp).toBe(1);
      expect(deps.session.getState().civilizations.player.strategicArsenal).toBe(0);
      expect(deps.session.getState().civilizations.player.diplomacy.relationships[aiCivId]).toBe(-60);
      expect(deps.showNotification).toHaveBeenCalledWith('Strategic strike launched.', 'warning');
      // #545 MR5: SFX now fires from the registrar, never directly from the controller.
      expect(strategicStrikeSpy).not.toHaveBeenCalled();
      expect(emitted).toEqual([{ cityId: 'target', recipientCivId: aiCivId, actorCivId: 'player', goldLost: expect.any(Number) }]);
      strategicStrikeSpy.mockRestore();
    });
```

`SFX` is not currently imported in this test file — add `import { SFX } from '@/audio/sfx';` to its import block at the top.

- [ ] **Step 4: Rewrite the registrar**

Replace `src/presentation/register-strategic-strike-presentation.ts` entirely:

```ts
import type { PresentationRegistrar } from '@/presentation/register-all';
import { SFX } from '@/audio/sfx';
import { hasMetCivilization } from '@/systems/discovery-system';

/**
 * #545 MR4 defender-notification, consolidated in MR5 into the single
 * SFX + notification trigger for EVERY strategic strike, human- or
 * AI-initiated. MR4 called SFX.strategicStrike() directly from the two UI
 * controllers; MR5 is the first MR where a strike can happen with no UI
 * controller in the loop at all (an AI striking the human, or another AI),
 * so this registrar is now the only place that plays the SFX -- see
 * docs/superpowers/plans/2026-08-26-issue-545-mr5-ai-doctrine.md Task 9 for
 * the design-review finding this fixes.
 *
 * Notification: the struck civ (recipientCivId) is always told, regardless
 * of visibility -- you always know when it happens to you (unchanged MR4
 * behavior). Additionally, every OTHER human-controlled civ that has met
 * both the actor and the recipient gets a witness-flavor notification
 * (hot-seat's second human, or any future third+ human slot) -- scoped to
 * human civs only, since a flavor notification has no gameplay purpose for
 * an AI civ that isn't a party to the strike.
 *
 * SFX: plays at most once, gated on state.currentPlayer (the active
 * viewer) being a direct party (their own launch, or they were struck) or a
 * visibility-gated witness to an AI-vs-AI strike -- matching the existing
 * register-beast-presentation.ts `slayerCivId === state.currentPlayer`
 * precedent for viewer-specific effects.
 */
export const registerStrategicStrikePresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('city:strategic-strike', ({ cityId, recipientCivId, actorCivId, goldLost }) => {
      const state = ctx.session.getState();
      const cityName = state.cities[cityId]?.name ?? 'A city';
      const goldLine = goldLost > 0 ? ` and lost ${goldLost} gold` : '';
      ctx.notifier.deliver(recipientCivId, `${cityName} was struck by a strategic weapon${goldLine}.`, 'warning');

      const actorName = state.civilizations[actorCivId]?.name ?? 'A civilization';
      for (const [witnessCivId, witnessCiv] of Object.entries(state.civilizations)) {
        if (!witnessCiv.isHuman) continue;
        if (witnessCivId === actorCivId || witnessCivId === recipientCivId) continue;
        if (!hasMetCivilization(state, witnessCivId, actorCivId)) continue;
        if (!hasMetCivilization(state, witnessCivId, recipientCivId)) continue;
        ctx.notifier.deliver(witnessCivId, `${actorName} struck ${cityName} with a strategic weapon!`, 'warning');
      }

      const viewer = state.currentPlayer;
      const isParty = viewer === actorCivId || viewer === recipientCivId;
      const isWitness = !isParty
        && hasMetCivilization(state, viewer, actorCivId)
        && hasMetCivilization(state, viewer, recipientCivId);
      if (isParty || isWitness) SFX.strategicStrike();
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
```

- [ ] **Step 5: Rewrite the registrar's test file**

**A note on fixture safety, found during plan review**: `hasMetCivilization`'s fallback, `hasMetCivilizationByCurrentEvidence`, unconditionally reads `viewer.diplomacy.atWarWith`, `viewer.diplomacy.treaties`, `target.cities`, `target.units`, and `state.map.tiles` whenever neither side's `knownCivilizations` already proves contact. A civ fixture with only `{ isHuman, knownCivilizations }` and no `diplomacy`/`cities`/`units`, or a state with no `map`, **throws** (not just fails) the moment that fallback is reached — e.g. in the "hasn't met" test below, where neither side's `knownCivilizations` overlaps. Every fixture in this file uses a shared `makeCiv` helper and every state override includes `map: { tiles: {} }` specifically to keep that fallback path crash-safe, even in tests where the fast path (matching `knownCivilizations`) makes it unreachable — consistency here matters more than minimalism, since a future edit could easily shift which path a given test exercises.

Replace `tests/presentation/register-strategic-strike-presentation.test.ts` entirely:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { Civilization } from '@/core/types';
import { SFX } from '@/audio/sfx';
import { registerStrategicStrikePresentation } from '@/presentation/register-strategic-strike-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

// Crash-safe against hasMetCivilizationByCurrentEvidence's fallback (see
// this task's fixture-safety note) -- diplomacy/cities/units are always
// present, even when a given test only ever exercises the knownCivilizations
// fast path.
function makeCiv(id: string, overrides: Partial<Civilization> = {}): Civilization {
  return {
    id, name: id, color: '#fff', isHuman: false, civType: 'generic',
    cities: [], units: [], gold: 0, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
    knownCivilizations: [],
    ...overrides,
  } as Civilization;
}

describe('strategic strike presentation (#545 MR4/MR5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('notifies the defending civ that its city was struck, including the gold lost', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'p2' } } as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), p2: makeCiv('p2') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', actorCivId: 'p1', goldLost: 150 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('Rome'), 'warning');
    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('150'), 'warning');
  });

  it('omits the gold-loss clause when nothing was lost (garrisoned target)', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'p2' } } as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), p2: makeCiv('p2') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', actorCivId: 'p1', goldLost: 0 });

    const [, message] = (ctx.deliver as any).mock.calls[0];
    expect(message).not.toContain('gold');
  });

  it('handles an unknown city name gracefully', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: {} as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), p2: makeCiv('p2') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'nope', recipientCivId: 'p2', actorCivId: 'p1', goldLost: 0 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.any(String), 'warning');
  });

  it("the human's own launch plays SFX exactly once (regression: no double-fire between the controller and the registrar)", () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'p2' } } as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), p2: makeCiv('p2') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', actorCivId: 'p1', goldLost: 0 });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('an AI striking the human plays SFX (new coverage — this case was silent before MR5)', () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'p1' } } as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), 'ai-1': makeCiv('ai-1') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p1', actorCivId: 'ai-1', goldLost: 50 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.any(String), 'warning');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('an AI-vs-AI strike the human has met both civs in plays SFX and delivers a witness notification', () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'ai-2' } } as never,
        civilizations: {
          p1: makeCiv('p1', { isHuman: true, knownCivilizations: ['ai-1', 'ai-2'] }),
          'ai-1': makeCiv('ai-1', { name: 'Attacker' }),
          'ai-2': makeCiv('ai-2'),
        },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'ai-2', actorCivId: 'ai-1', goldLost: 20 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Rome'), 'warning');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("an AI-vs-AI strike the human hasn't met both civs in produces no witness notification and no SFX", () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'ai-2' } } as never,
        civilizations: {
          p1: makeCiv('p1', { isHuman: true }),
          'ai-1': makeCiv('ai-1'),
          'ai-2': makeCiv('ai-2'),
        },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'ai-2', actorCivId: 'ai-1', goldLost: 20 });

    // p1 still gets nothing beyond what recipientCivId ('ai-2', not human) already got.
    expect(ctx.deliver).not.toHaveBeenCalledWith('p1', expect.anything(), expect.anything());
    expect(spy).not.toHaveBeenCalled();
  });

  it('a second hot-seat human who met both civs is notified even when not the current viewer, but SFX does not fire an extra time', () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1', // p1 is active; p2 is the OTHER human, not currently viewing
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'ai-2' } } as never,
        civilizations: {
          p1: makeCiv('p1', { isHuman: true }),
          p2: makeCiv('p2', { isHuman: true, knownCivilizations: ['ai-1', 'ai-2'] }),
          'ai-1': makeCiv('ai-1', { name: 'Attacker' }),
          'ai-2': makeCiv('ai-2'),
        },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'ai-2', actorCivId: 'ai-1', goldLost: 20 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('Rome'), 'warning');
    expect(spy).not.toHaveBeenCalled(); // p1 (the active viewer) hasn't met either civ
  });
});
```

- [ ] **Step 6: Run tests, then full build**

Run: `bash scripts/run-with-mise.sh yarn test tests/presentation/register-strategic-strike-presentation.test.ts tests/app/controllers/panel-actions-controller.test.ts tests/app/controllers/selection-controller.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — this is the point where Task 8's `actorCivId` field on the `bus.emit` call finally type-checks clean.

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS (full suite)

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/app/controllers/panel-actions-controller.ts src/app/controllers/selection-controller.ts src/presentation/register-strategic-strike-presentation.ts tests/presentation/register-strategic-strike-presentation.test.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "feat(#545): consolidate strategic-strike SFX/notification into one registrar (MR5 Task 9)"
```

---

### Task 10: Retaliation-risk preview note

**Files:**
- Modify: `src/ui/strategic-launch-flow.ts`
- Test: `tests/ui/strategic-launch-flow.test.ts`

**Interfaces:**
- Consumes: `hasKnownStrategicCapability` (Task 1).

The existing `makeState()` helper in `tests/ui/strategic-launch-flow.test.ts` already sets `p1.diplomacy = { ...AT_WAR_WITH_P2, strategicStrikesReceivedFrom: [] }`, i.e. `atWarWith: ['p2']`. Since `hasMetCivilization`'s fallback (`hasMetCivilizationByCurrentEvidence`) treats being at war as contact evidence, `hasMetCivilization(state, 'p1', 'p2')` is already `true` under the default fixture with no extra setup — the only thing the new tests need to add is `builtNationalProjects` for the "has capability" case (present) vs. omitted (absent).

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/strategic-launch-flow.test.ts`, after the existing `'labels reputation-magnitude preview correctly...'` test:

```ts
describe('retaliation-risk preview note (#545 MR5)', () => {
  it('shows the retaliation-risk note when the target civ has known strategic capability', () => {
    const container = document.createElement('div');
    const state = makeState({
      builtNationalProjects: { 'p2:manhattan_project': { civId: 'p2', cityId: 'target', eraBuilt: 10 } } as never,
    });
    createStrategicLaunchFlow(container, state, 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(container.textContent).toContain('their own strategic capability');
  });

  it('omits the note when the target civ has no known strategic capability', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(container.textContent).not.toContain('their own strategic capability');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/strategic-launch-flow.test.ts`
Expected: FAIL (text not found)

- [ ] **Step 3: Implement**

Add the import to `src/ui/strategic-launch-flow.ts`:

```ts
import { getStrategicArsenal, hasKnownStrategicCapability } from '@/systems/strategic-arsenal-system';
```

(This replaces the existing single-name import of `getStrategicArsenal` from that module — combine into one import statement.)

In `renderImpactPreview`, add a line to the `lines` array, right after the reputation-delta line and before the arsenal-after line:

```ts
    const lines = [
      `${devastatedCount} surrounding tile(s) will be devastated for multiple turns.`,
      effect?.hasGarrison
        ? `${city.name} is garrisoned -- the strike will be at least partially blocked. No gold will be lost.`
        : `${city.name} will be struck down to 1 HP. It will lose ${effect?.goldLost ?? 0} gold.`,
      isRetaliation
        ? `Relations with this civ will fall by ${deltas.target} (retaliation). Witnesses will react by ${deltas.witness}.`
        : `Relations with this civ will fall sharply by ${deltas.target} (unprovoked first use). Witnesses will react by ${deltas.witness}.`,
      ...(hasKnownStrategicCapability(state, actorCivId, city.owner)
        ? ['This civilization has their own strategic capability -- they may be willing to retaliate.']
        : []),
      `Arsenal after launch: ${arsenalAfter}.`,
    ];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/strategic-launch-flow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/strategic-launch-flow.ts tests/ui/strategic-launch-flow.test.ts
git commit -m "feat(#545): retaliation-risk note in the strategic launch preview (MR5 Task 10)"
```

---

### Task 11: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — full suite (~541 files / 9000+ tests) plus the hook smoke tests. Pay particular attention to:
- `tests/systems/national-project-balance.test.ts` and `tests/systems/wonder-definitions.test.ts` (unaffected — confirm they still pass, not skip)
- `tests/systems/pacing-audit.test.ts` and `tests/systems/pacing-reference-economy.test.ts` (unaffected — no yield/economy change in this MR)
- `tests/app/architecture-boundaries.test.ts` (the new `src/ai/ai-strategic-doctrine.ts` leaf module and its one `basic-ai.ts` call site should not trip any composition-root boundary rule, since AI logic living in `src/ai/` and being called from `basic-ai.ts` matches the existing pattern every other AI module already follows)

- [ ] **Step 2: Run the production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS clean, zero TypeScript errors.

- [ ] **Step 3: Manual sanity pass on the two most important dimensions this MR affects**

If a browser preview is available for this project, load a save (or start a new game), and:
- Open the diplomacy panel against an AI civ that has Manhattan Project built and is not at war — confirm the "wary of your strategic capability" note appears.
- Open the strategic launch flow's stage-2 preview against a target civ with known strategic capability — confirm the retaliation-risk note appears.

If no browser preview is practical for this change (it's primarily AI-internal turn-processing logic), skip this step and say so explicitly rather than claiming visual verification that didn't happen.

- [ ] **Step 4: Tick every checkbox in this plan document**

Go back through every task above and mark its checkboxes complete, matching the pattern MR1–4's plan docs used (`docs/superpowers/plans/2026-08-25-issue-545-mr4-reputation-launch-ux.md` is the template — read its header to see the "plan doc executed" convention this arc follows).

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/plans/2026-08-26-issue-545-mr5-ai-doctrine.md
git commit -m "docs(#545): mark MR5 plan doc executed, tick all task/DoD checkboxes"
```

At this point the branch is ready for the standard finishing-a-development-branch flow (push, open PR with "Part of #545" — never "Closes #545" — watch CI, request review) per this arc's established process notes; that is a separate decision for the user to trigger, not part of this implementation plan.
