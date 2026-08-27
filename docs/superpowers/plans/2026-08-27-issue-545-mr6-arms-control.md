# #545 MR6 — Arms Control Treaty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. **Do not use superpowers:subagent-driven-development or any other multi-agent workflow — this repository's CLAUDE.md forbids subagents/parallel agents for all work; execute every task inline in the current session.** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the arc's one v1 arms-control mechanic (spec §12) — a bilateral, auto-computed arsenal cap treaty that blocks further warhead production while it holds, breakable through the existing generic treaty-break UI.

**Architecture:** The cap is computed once at signing time (`computeArmsControlCap`, floored at 1) and stored on the `Treaty` record. A single new `getArsenalStatus` helper replaces four duplicated inline capacity computations, folding the treaty cap into the same `atCapacity` boolean `getAvailableBuildings` already uses to gate `warhead` production — no new enforcement pass. Signing happens at three existing call sites (human-initiated, AI↔AI immediate, human-accepts-AI-proposal), all sharing the one cap-computation helper. The AI's own decision to propose is a new, independent branch in `evaluateDiplomacy`, gated by the same relationship/diplomacyFocus bar `non_aggression_pact` already uses, plus two capability checks reusing MR5's `hasKnownStrategicCapability` predicate.

**Tech Stack:** TypeScript, Canvas 2D + DOM UI, vitest.

## Global Constraints

- `arsenalCap` is optional (`Treaty.arsenalCap?: number`) from the first commit — no save migration, matching the lesson from MR4's `strategicStrikesReceivedFrom` mistake (made required, broke ~15 fixtures, later fixed to optional).
- The auto-computed cap is `max(civA.strategicArsenal, civB.strategicArsenal, 1)` — **never less than 1**. A cap of exactly 0 is reachable (both civs can have Manhattan Project without ever having built a warhead) and would permanently ban either signatory from ever building one without first eating a -30 reputation hit — see the design doc's review finding #1/#2 (also protects MR5's Veteran existential-threat gate, which requires `strategicArsenal >= 1` to have any legal target).
- `evaluateProposal` (`src/ai/ai-diplomacy.ts`) stays untouched and dead — tracked in [a1flecke/conquestoria#901](https://github.com/a1flecke/conquestoria/issues/901), explicitly out of scope for this MR.
- No new SFX (no treaty sign/break has any today); no new "break" confirmation UI (the existing generic two-click confirm in `diplomacy-panel.ts` already covers every `TreatyType`).
- `yarn build` (not just `yarn test`) must be run after any task that changes a widely-shared function signature or a `Record<TreatyType, ...>` mapping — Tasks 1, 5, and 6 below each call this out.

---

## File Map

| File | Change |
|---|---|
| `src/core/types.ts` | `TreatyType` gains `'arms_control_pact'`; `Treaty` gains `arsenalCap?: number` |
| `src/ui/notification-routing.ts` | `TREATY_LABELS` gains an entry (compile-time requirement) |
| `src/systems/strategic-arsenal-system.ts` | + `computeArmsControlCap`, `getActiveArmsControlCap`, `getArsenalStatus` |
| `src/systems/diplomacy-system.ts` | `signTreaty` extension; + `hasArmsControlTreaty`; `getAvailableActions` gate; `requiresContact` update; new `applyDiplomaticAction` case; `acceptDiplomaticRequest` cap computation |
| `src/ai/ai-diplomacy.ts` | `evaluateDiplomacy` new branch + signature extension |
| `src/ai/basic-ai.ts` | thread new args into `evaluateDiplomacy`; new decision-execution switch case |
| `src/ui/city-panel.ts` | consolidate to `getArsenalStatus`; effective-cap display |
| `src/ai/ai-production.ts` | consolidate to `getArsenalStatus` |
| `src/systems/planning-system.ts` | consolidate to `getArsenalStatus` (×2 call sites) |
| `src/ui/diplomacy-panel.ts` | treaty label shows the cap number |
| `src/systems/strategic-arsenal-summary-presentation.ts` | + `activeArmsControlCap` |
| `src/ui/strategic-arsenal-panel.ts` | render the active cap |

---

### Task 1: Data model + `TREATY_LABELS`

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/ui/notification-routing.ts`
- Test: `tests/ui/notification-routing.test.ts` (only if it already asserts on `TREATY_LABELS`'s full shape — check first; if not, this task's own build-passes check is sufficient verification)

**Interfaces:**
- Produces: `TreatyType` includes `'arms_control_pact'`; `Treaty.arsenalCap?: number`. Consumed by every later task.

- [ ] **Step 1: Make the type changes**

In `src/core/types.ts`, find `export type TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance' | 'vassalage';` and change it to:

```ts
export type TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance' | 'vassalage' | 'arms_control_pact';
```

Find the `Treaty` interface (right below) and add the new field:

```ts
export interface Treaty {
  type: TreatyType;
  civA: string;
  civB: string;
  turnsRemaining: number;     // -1 = permanent until broken
  goldPerTurn?: number;       // for trade agreements
  // #545 MR6: only set for arms_control_pact -- see computeArmsControlCap in
  // strategic-arsenal-system.ts. Absent on every other treaty type.
  arsenalCap?: number;
}
```

- [ ] **Step 2: Add the required `TREATY_LABELS` entry**

In `src/ui/notification-routing.ts`, find:

```ts
export const TREATY_LABELS: Record<TreatyType, string> = {
  non_aggression_pact: 'Non-Aggression Pact',
  trade_agreement: 'Trade Agreement',
  open_borders: 'Open Borders',
  alliance: 'Alliance',
  vassalage: 'Vassalage',
};
```

and add the new entry:

```ts
export const TREATY_LABELS: Record<TreatyType, string> = {
  non_aggression_pact: 'Non-Aggression Pact',
  trade_agreement: 'Trade Agreement',
  open_borders: 'Open Borders',
  alliance: 'Alliance',
  vassalage: 'Vassalage',
  arms_control_pact: 'Arms Control Pact',
};
```

- [ ] **Step 3: Run the build to confirm it compiles**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS. If it fails with "Property 'arms_control_pact' is missing" on any other `Record<TreatyType, ...>` mapping, that mapping needs the same treatment — re-run `grep -rn "Record<TreatyType" src` to find it (only `TREATY_LABELS` was found during design/plan-writing, but re-verify against the live tree since files can drift).

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/ui/notification-routing.ts
git commit -m "feat(#545): add arms_control_pact TreatyType + arsenalCap field (MR6 Task 1)"
```

---

### Task 2: Cap computation + shared arsenal-status helper

**Files:**
- Modify: `src/systems/strategic-arsenal-system.ts`
- Test: `tests/systems/strategic-arsenal-system.test.ts`

**Interfaces:**
- Consumes: `Treaty.arsenalCap` (Task 1).
- Produces: `computeArmsControlCap(state: GameState, civAId: string, civBId: string): number`; `getActiveArmsControlCap(state: GameState, civId: string): number | null`; `getArsenalStatus(state: GameState, civId: string): { hasManhattanProject: boolean; atCapacity: boolean }`. Consumed by Tasks 3, 4, 5, 8.

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/strategic-arsenal-system.test.ts`, after the existing `describe('spendStrategicArsenal', ...)` block (end of file):

```ts
import { computeArmsControlCap, getActiveArmsControlCap, getArsenalStatus } from '@/systems/strategic-arsenal-system';

describe('computeArmsControlCap (#545 MR6)', () => {
  it('is the higher of the two arsenals', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ strategicArsenal: 5 }), p2: makeCiv({ id: 'p2', strategicArsenal: 2 }) },
    });
    expect(computeArmsControlCap(state, 'p1', 'p2')).toBe(5);
    expect(computeArmsControlCap(state, 'p2', 'p1')).toBe(5); // symmetric regardless of argument order
  });

  it('floors at 1 even when both arsenals are 0', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ strategicArsenal: 0 }), p2: makeCiv({ id: 'p2', strategicArsenal: 0 }) },
    });
    expect(computeArmsControlCap(state, 'p1', 'p2')).toBe(1);
  });

  it('floors at 1 when arsenal is absent (never built a warhead)', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({}), p2: makeCiv({ id: 'p2' }) },
    });
    expect(computeArmsControlCap(state, 'p1', 'p2')).toBe(1);
  });

  it('treats an unknown civ as arsenal 0', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ strategicArsenal: 3 }) },
    });
    expect(computeArmsControlCap(state, 'p1', 'nobody')).toBe(3);
  });
});

describe('getActiveArmsControlCap (#545 MR6)', () => {
  it('is null with no active pact', () => {
    const state = makeState({ civilizations: { p1: makeCiv({}) } });
    expect(getActiveArmsControlCap(state, 'p1')).toBeNull();
  });

  it('returns the single active pact cap', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv({
          diplomacy: { relationships: {}, treaties: [{ type: 'arms_control_pact', civA: 'p1', civB: 'p2', turnsRemaining: -1, arsenalCap: 4 }], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        }),
      },
    });
    expect(getActiveArmsControlCap(state, 'p1')).toBe(4);
  });

  it('returns the MINIMUM (most restrictive) across multiple active pacts', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv({
          diplomacy: {
            relationships: {}, events: [], atWarWith: [], treacheryScore: 0,
            vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
            treaties: [
              { type: 'arms_control_pact', civA: 'p1', civB: 'p2', turnsRemaining: -1, arsenalCap: 6 },
              { type: 'arms_control_pact', civA: 'p3', civB: 'p1', turnsRemaining: -1, arsenalCap: 2 },
            ],
          },
        }),
      },
    });
    expect(getActiveArmsControlCap(state, 'p1')).toBe(2);
  });

  it('ignores non-arms-control treaties', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv({
          diplomacy: { relationships: {}, events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 }, treaties: [{ type: 'alliance', civA: 'p1', civB: 'p2', turnsRemaining: -1 }] },
        }),
      },
    });
    expect(getActiveArmsControlCap(state, 'p1')).toBeNull();
  });
});

describe('getArsenalStatus (#545 MR6)', () => {
  it('atCapacity reflects physical capacity when no treaty cap is active', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: [], strategicArsenal: 1 }) },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // base capacity 1, arsenal 1 -> at capacity
    expect(getArsenalStatus(state, 'p1').atCapacity).toBe(true);
    expect(getArsenalStatus(state, 'p1').hasManhattanProject).toBe(true);
  });

  it('atCapacity becomes true from a treaty cap even with physical capacity remaining', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv({
          cities: [], strategicArsenal: 1,
          diplomacy: { relationships: {}, events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 }, treaties: [{ type: 'arms_control_pact', civA: 'p1', civB: 'p2', turnsRemaining: -1, arsenalCap: 1 }] },
        }),
      },
      builtNationalProjects: {
        'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 },
      },
      cities: { c1: makeCity('c1', ['missile_silo']) }, // +1 physical capacity, but treaty cap is 1
    });
    expect(getArsenalStatus(state, 'p1').atCapacity).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-system.test.ts`
Expected: FAIL (`computeArmsControlCap`/`getActiveArmsControlCap`/`getArsenalStatus` not exported)

- [ ] **Step 3: Implement**

In `src/systems/strategic-arsenal-system.ts`, add after `hasKnownStrategicCapability` (from MR5):

```ts
/**
 * #545 MR6 spec §12: both signatories are capped at the higher of their two
 * current arsenals, floored at 1 -- never 0. A floor of exactly 0
 * (legitimately reachable: hasKnownStrategicCapability only requires
 * Manhattan Project, not any built warhead) would permanently ban either
 * signatory from ever building one without first breaking the pact, and
 * would leave a Veteran AI with zero possible existential-threat response
 * (ai-strategic-doctrine.ts's gate requires strategicArsenal >= 1).
 */
export function computeArmsControlCap(state: GameState, civAId: string, civBId: string): number {
  const civA = state.civilizations[civAId];
  const civB = state.civilizations[civBId];
  return Math.max(
    civA ? getStrategicArsenal(civA) : 0,
    civB ? getStrategicArsenal(civB) : 0,
    1,
  );
}

/**
 * Most-restrictive (minimum) cap across every active arms_control_pact this
 * civ is a party to -- a civ can sign multiple pacts with different
 * partners at different caps; each is independently binding.
 */
export function getActiveArmsControlCap(state: GameState, civId: string): number | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;
  const caps = civ.diplomacy.treaties
    .filter(t => t.type === 'arms_control_pact' && (t.civA === civId || t.civB === civId))
    .map(t => t.arsenalCap)
    .filter((cap): cap is number => cap !== undefined);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/**
 * #545 MR6: single shared computation, replacing four previously-duplicated
 * inline { hasManhattanProject, atCapacity } object literals (city-panel.ts,
 * ai-production.ts, planning-system.ts x2). Folds the arms-control treaty
 * cap into the same atCapacity boolean getAvailableBuildings already uses to
 * gate warhead production -- no separate enforcement pass needed.
 */
export function getArsenalStatus(state: GameState, civId: string): { hasManhattanProject: boolean; atCapacity: boolean } {
  const civ = state.civilizations[civId];
  const current = civ ? getStrategicArsenal(civ) : 0;
  const physicalCap = getStrategicArsenalCapacity(state, civId);
  const treatyCap = getActiveArmsControlCap(state, civId);
  const effectiveCap = treatyCap !== null ? Math.min(physicalCap, treatyCap) : physicalCap;
  return {
    hasManhattanProject: hasManhattanProject(state, civId),
    atCapacity: current >= effectiveCap,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/strategic-arsenal-system.ts tests/systems/strategic-arsenal-system.test.ts
git commit -m "feat(#545): computeArmsControlCap + getArsenalStatus helpers (MR6 Task 2)"
```

---

### Task 3: `signTreaty` extension + `hasArmsControlTreaty` + `getAvailableActions` gate

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Test: `tests/systems/diplomacy-system.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 2 in this task specifically (cap values are passed in by callers in Tasks 4/5/6, not computed here).
- Produces: `signTreaty(..., arsenalCap?: number)`; `hasArmsControlTreaty(state: GameState, civId: string): boolean`; `getAvailableActions(state, targetCivId, completedTechs, era, hasArmsControlTreaty: boolean)`. Consumed by Tasks 4, 5, 6.

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/diplomacy-system.test.ts`, inside the existing `describe('treaties', ...)` block (after the `'breakTreaty removes treaty and penalizes -30'` test):

```ts
    it('arsenalCap is set only for arms_control_pact, ignored for every other type (#545 MR6)', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = signTreaty(state, 'player', 'ai-egypt', 'arms_control_pact', -1, 15, 4);
      expect(state.treaties[0].arsenalCap).toBe(4);

      let other = createDiplomacyState(civIds, 'player');
      other = signTreaty(other, 'player', 'ai-egypt', 'alliance', -1, 15, 4); // stray cap value must not leak
      expect(other.treaties[0].arsenalCap).toBeUndefined();
    });
```

Add a new `describe` block after `describe('getAvailableActions', ...)`:

```ts
  describe('hasArmsControlTreaty (#545 MR6)', () => {
    it('is false when the Arms Control Treaty national project has not been built', () => {
      const state = createNewGame(undefined, 'arms-control-np-test', 'small');
      expect(hasArmsControlTreaty(state, 'player')).toBe(false);
    });

    it('is true once player:arms_control_treaty is in builtNationalProjects', () => {
      const state = createNewGame(undefined, 'arms-control-np-test-2', 'small');
      state.builtNationalProjects = { 'player:arms_control_treaty': { civId: 'player', cityId: 'c1', eraBuilt: 11 } };
      expect(hasArmsControlTreaty(state, 'player')).toBe(true);
    });

    it('is civ-scoped', () => {
      const state = createNewGame(undefined, 'arms-control-np-test-3', 'small');
      state.builtNationalProjects = { 'ai-1:arms_control_treaty': { civId: 'ai-1', cityId: 'c1', eraBuilt: 11 } };
      expect(hasArmsControlTreaty(state, 'player')).toBe(false);
    });
  });
```

Extend `describe('getAvailableActions', ...)` with two new tests (existing tests keep working since the new param has no default — this task's Step 1 also updates every existing call in that block, see below):

```ts
    it('offers arms_control_pact once the proposer has hasArmsControlTreaty', () => {
      const state = createDiplomacyState(civIds, 'player');
      const actions = getAvailableActions(state, 'ai-egypt', [], 1, true);
      expect(actions).toContain('arms_control_pact');
    });

    it('omits arms_control_pact without the national project, regardless of relationship/era/tech', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 90);
      const actions = getAvailableActions(state, 'ai-egypt', ['diplomacy-tech', 'trade-routes'], 12, false);
      expect(actions).not.toContain('arms_control_pact');
    });
```

Update the 4 existing `getAvailableActions(...)` calls already in that `describe` block to append `, false` (no national project, preserves original meaning exactly):

```ts
    it('always includes declare_war when not at war', () => {
      const state = createDiplomacyState(civIds, 'player');
      const actions = getAvailableActions(state, 'ai-egypt', [], 1, false);
      expect(actions).toContain('declare_war');
    });

    it('includes request_peace when at war', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 1);
      const actions = getAvailableActions(state, 'ai-egypt', [], 1, false);
      expect(actions).toContain('request_peace');
      expect(actions).not.toContain('declare_war');
    });

    it('includes non_aggression_pact with diplomacy-tech', () => {
      const state = createDiplomacyState(civIds, 'player');
      const actions = getAvailableActions(state, 'ai-egypt', ['diplomacy-tech'], 1, false);
      expect(actions).toContain('non_aggression_pact');
    });

    it('includes trade_agreement with trade-routes tech and positive relationship', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 10);
      const actions = getAvailableActions(state, 'ai-egypt', ['trade-routes'], 1, false);
      expect(actions).toContain('trade_agreement');
    });
```

Update the import block at the top of the test file to add `hasArmsControlTreaty`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/diplomacy-system.test.ts`
Expected: FAIL (wrong argument count / `hasArmsControlTreaty` not exported)

- [ ] **Step 3: Implement**

In `src/systems/diplomacy-system.ts`, extend `signTreaty`:

```ts
export function signTreaty(
  state: DiplomacyState,
  selfId: string,
  otherCivId: string,
  type: TreatyType,
  turnsRemaining: number,
  turn: number,
  arsenalCap?: number,
): DiplomacyState {
  const treaty: Treaty = {
    type,
    civA: selfId,
    civB: otherCivId,
    turnsRemaining,
  };
  if (type === 'trade_agreement') {
    treaty.goldPerTurn = 2;
  }
  if (type === 'arms_control_pact' && arsenalCap !== undefined) {
    treaty.arsenalCap = arsenalCap;
  }
  const newState = {
    ...state,
    treaties: [...state.treaties, treaty],
    events: [
      // ...unchanged below (do not touch the rest of this function)
```

Add the new helper right after `getAvailableActions` (before `canReabsorbBreakaway`):

```ts
/**
 * #545 MR6 spec §12: "available to propose once the proposing civ has
 * completed the Arms Control Treaty national project" -- the only human-
 * facing gate for this action (unlike every other treaty type, there is no
 * relationship/era/tech condition here; see getAvailableActions below).
 */
export function hasArmsControlTreaty(state: GameState, civId: string): boolean {
  return state.builtNationalProjects?.[`${civId}:arms_control_treaty`] !== undefined;
}
```

Extend `getAvailableActions`'s signature and add the gate, right after the existing `alliance`/`open_borders` block (before the vassalage block):

```ts
export function getAvailableActions(
  state: DiplomacyState,
  targetCivId: string,
  completedTechs: string[],
  era: number,
  hasArmsControlTreaty: boolean,
): DiplomaticAction[] {
  const actions: DiplomaticAction[] = [];
  const atWar = isAtWar(state, targetCivId);

  if (atWar) {
    actions.push('request_peace');
  } else {
    actions.push('declare_war');

    // ...unchanged NAP/trade/alliance/open_borders block...

    if (hasArmsControlTreaty) {
      actions.push('arms_control_pact');
    }

    // Vassalage (only when weakened, era >= 2, not already a vassal)
    // ...unchanged below
```

- [ ] **Step 4: Run tests to verify they pass, then type-check**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/diplomacy-system.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: FAILS at this point — the 3 real call sites of `getAvailableActions` (`diplomacy-panel.ts`, `ai-diplomacy.ts`, `basic-ai.ts`'s direct call) still pass only 4 arguments. This is expected; Task 6 fixes the `ai-diplomacy.ts`/`basic-ai.ts` side, Task 8 fixes `diplomacy-panel.ts`. Confirm the *only* build errors are at those 3 call sites (grep `getAvailableActions(` across `src` to enumerate them, matching the design doc's Architecture §5 list) before moving on.

- [ ] **Step 5: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-system.test.ts
git commit -m "feat(#545): signTreaty arsenalCap + hasArmsControlTreaty gate (MR6 Task 3)"
```

---

### Task 4: `applyDiplomaticAction` new case (human-initiated signing)

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Test: `tests/systems/diplomacy-system.test.ts`

**Interfaces:**
- Consumes: `computeArmsControlCap` (Task 2), `signTreaty`'s new signature (Task 3).
- Produces: `applyDiplomaticAction(state, actorId, targetCivId, 'arms_control_pact', bus)` signs both sides with the computed cap.

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/diplomacy-system.test.ts`'s `describe('applyDiplomaticAction', ...)` block:

```ts
    it('arms_control_pact signs both sides immediately with the computed cap (#545 MR6)', () => {
      const state = createNewGame(undefined, 'arms-control-sign-test', 'small');
      state.civilizations.player.knownCivilizations = ['ai-1'];
      state.civilizations['ai-1'].knownCivilizations = ['player'];
      state.civilizations.player.strategicArsenal = 3;
      state.civilizations['ai-1'].strategicArsenal = 1;

      const result = applyDiplomaticAction(state, 'player', 'ai-1', 'arms_control_pact', new EventBus());

      expect(result.civilizations.player.diplomacy.treaties).toContainEqual(
        expect.objectContaining({ type: 'arms_control_pact', civA: 'player', civB: 'ai-1', arsenalCap: 3 }),
      );
      expect(result.civilizations['ai-1'].diplomacy.treaties).toContainEqual(
        expect.objectContaining({ type: 'arms_control_pact', civA: 'ai-1', civB: 'player', arsenalCap: 3 }),
      );
    });

    it('arms_control_pact requires prior contact, same #435 guard as every other treaty type', () => {
      const state = createNewGame(undefined, 'arms-control-no-contact-test', 'small');
      // No knownCivilizations set on either side -- unmet.
      const result = applyDiplomaticAction(state, 'player', 'ai-1', 'arms_control_pact', new EventBus());
      expect(result).toBe(state); // unchanged -- guard returns the input state verbatim
      expect(result.civilizations.player.diplomacy.treaties).toHaveLength(0);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/diplomacy-system.test.ts`
Expected: FAIL (`arms_control_pact` falls through to `default: return state;` in the switch, and the `#435` guard test may already accidentally pass since the default case also no-ops — verify the *first* new test fails specifically on the treaty-content assertion, confirming the case doesn't exist yet)

- [ ] **Step 3: Implement**

In `src/systems/diplomacy-system.ts`, add `'arms_control_pact'` to the `requiresContact` array (the #435 guard) inside `applyDiplomaticAction`:

```ts
  const requiresContact: DiplomaticAction[] = [
    'declare_war', 'non_aggression_pact', 'trade_agreement', 'open_borders', 'alliance', 'arms_control_pact',
  ];
```

Add a new case in the `switch (action)` block, right after the combined `non_aggression_pact | trade_agreement | open_borders | alliance` case's closing `}` and before `case 'reabsorb_breakaway':`:

```ts
    case 'arms_control_pact': {
      const cap = computeArmsControlCap(state, actorId, targetCivId);
      bus.emit('diplomacy:treaty-accepted', { civA: actorId, civB: targetCivId, treaty: action });
      const actorTreatyState = signTreaty(actor.diplomacy, actorId, targetCivId, action, -1, state.turn, cap);
      const targetTreatyState = signTreaty(target.diplomacy, targetCivId, actorId, action, -1, state.turn, cap);
      return {
        ...state,
        civilizations: {
          ...state.civilizations,
          [actorId]: { ...actor, diplomacy: actorTreatyState },
          [targetCivId]: { ...target, diplomacy: targetTreatyState },
        },
      };
    }
```

Add the import for `computeArmsControlCap` at the top of the file:

```ts
import { computeArmsControlCap } from '@/systems/strategic-arsenal-system';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/diplomacy-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-system.test.ts
git commit -m "feat(#545): human-initiated arms_control_pact signing (MR6 Task 4)"
```

---

### Task 5: `acceptDiplomaticRequest` cap computation (AI→human accept path)

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Test: `tests/systems/diplomacy-system.test.ts`

**Interfaces:**
- Consumes: `computeArmsControlCap` (Task 2, already imported by Task 4).
- Produces: `acceptDiplomaticRequest` signs an `arms_control_pact` pending request with the cap computed from *current* (accept-time) arsenals.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/diplomacy-system.test.ts`'s treaty-proposal `describe` block (the one containing `makeTreatyState`):

```ts
    it('accepting a pending arms_control_pact computes the cap at accept time, not propose time (#545 MR6)', () => {
      const state = makeTreatyState();
      state.civilizations['ai-1'].strategicArsenal = 2;
      state.civilizations.player.strategicArsenal = 1;
      const proposed = enqueueTreatyProposal(state, 'ai-1', 'player', 'arms_control_pact', -1);
      const requestId = proposed.pendingDiplomacyRequests![0].id;

      // Arsenal changes between proposal and accept -- the cap must reflect
      // the CURRENT counts at accept time.
      const grown = {
        ...proposed,
        civilizations: {
          ...proposed.civilizations,
          player: { ...proposed.civilizations.player, strategicArsenal: 5 },
        },
      };

      const accepted = acceptDiplomaticRequest(grown, 'player', requestId, new EventBus());
      expect(accepted.civilizations.player.diplomacy.treaties).toContainEqual(
        expect.objectContaining({ type: 'arms_control_pact', arsenalCap: 5 }),
      );
      expect(accepted.civilizations['ai-1'].diplomacy.treaties).toContainEqual(
        expect.objectContaining({ type: 'arms_control_pact', arsenalCap: 5 }),
      );
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/diplomacy-system.test.ts`
Expected: FAIL (`arsenalCap` undefined — `signTreaty` called without the cap argument today)

- [ ] **Step 3: Implement**

In `acceptDiplomaticRequest`, inside the `if (request.type === 'treaty') { ... }` block, compute the cap conditionally before building `next`:

```ts
  if (request.type === 'treaty') {
    const turns = request.turnsRemaining ?? -1;
    const cap = request.treatyType === 'arms_control_pact'
      ? computeArmsControlCap(state, request.fromCivId, request.toCivId)
      : undefined;
    const next = {
      ...state,
      pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(candidate => candidate.id !== requestId),
      civilizations: {
        ...state.civilizations,
        [request.fromCivId]: {
          ...actor,
          diplomacy: signTreaty(actor.diplomacy, request.fromCivId, request.toCivId, request.treatyType!, turns, state.turn, cap),
        },
        [request.toCivId]: {
          ...target,
          diplomacy: signTreaty(target.diplomacy, request.toCivId, request.fromCivId, request.treatyType!, turns, state.turn, cap),
        },
      },
    };
    bus.emit('diplomacy:treaty-accepted', { civA: request.fromCivId, civB: request.toCivId, treaty: request.treatyType! });
    return next;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/diplomacy-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-system.test.ts
git commit -m "feat(#545): compute arms-control cap at accept time (MR6 Task 5)"
```

---

### Task 6: `evaluateDiplomacy` new branch (AI's own proposing decision)

**Files:**
- Modify: `src/ai/ai-diplomacy.ts`
- Test: `tests/ai/ai-diplomacy.test.ts`

**Interfaces:**
- Consumes: `getAvailableActions`'s new signature (Task 3), `hasKnownStrategicCapability` (MR5, already imported via `DiplomaticContext.targetHasKnownStrategicCapability`).
- Produces: `evaluateDiplomacy(..., hasArmsControlTreaty: boolean, actorHasKnownCapability: boolean)` — two new trailing params. Consumed by Task 7.

**⚠️ This changes `evaluateDiplomacy`'s signature again (MR5 already added one param; this adds two more). Its only caller is `basic-ai.ts` (Task 7). Run `yarn build` after this task and confirm the only error is in `basic-ai.ts`.**

- [ ] **Step 1: Write the failing tests**

Update every existing `evaluateDiplomacy(...)` call in `tests/ai/ai-diplomacy.test.ts` (there are 5 after MR5) to append `, false, false` (no national project, actor's own capability unknown — preserves original meaning exactly, since none of those tests care about arms control):

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
      false,
      false,
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
      false,
      false,
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
      false,
      false,
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
      false,
      false,
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
      false,
      false,
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
      false,
      false,
    );
    expect(withCaution.find(d => d.action === 'declare_war')).toBeUndefined();
  });

  it('proposes arms_control_pact when both capability checks and the relationship/diplomacyFocus bar are met (#545 MR6)', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality, // diplomacyFocus: 0.8, well above the 0.4 bar
      makeDiplomacy({ relationships: { player: 10 } }), // above the >0 bar
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: true } },
      0,
      true,  // hasArmsControlTreaty
      true,  // actorHasKnownCapability
    );
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeDefined();
  });

  it('omits arms_control_pact when the actor itself has no known capability, even if everything else qualifies', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 10 } }),
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: true } },
      0,
      true,
      false, // actorHasKnownCapability
    );
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeUndefined();
  });

  it('omits arms_control_pact when the actor does not know the target has capability, even if everything else qualifies', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 10 } }),
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      true,
      true,
    );
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeUndefined();
  });

  it('play-styles invariant: a civ with no known capability is never proposed an arms-control pact, regardless of relationship (#545 MR6)', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 90 } }), // maximally friendly
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      true,
      true,
    );
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeUndefined();
  });

  it('arms_control_pact can coexist with an alliance decision for the same target in the same call', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 60 } }), // clears alliance's own >50 bar too
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: true } },
      0,
      true,
      true,
    );
    expect(decisions.find(d => d.action === 'alliance')).toBeDefined();
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-diplomacy.test.ts`
Expected: FAIL (wrong argument count / TS error)

- [ ] **Step 3: Implement**

In `src/ai/ai-diplomacy.ts`, extend `evaluateDiplomacy`'s signature and `getAvailableActions` call, and add the new branch after the existing `alliance`/`trade_agreement`/`non_aggression_pact` `else-if` chain (still inside the `else` block, same indentation level — a separate `if`, not another `else if`, per the design's "not competing for the same slot" decision):

```ts
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
  hasArmsControlTreaty: boolean,
  actorHasKnownCapability: boolean,
): DiplomaticDecision[] {
  const decisions: DiplomaticDecision[] = [];

  for (const civId of Object.keys(diplomacy.relationships)) {
    const actions = getAvailableActions(diplomacy, civId, completedTechs, era, hasArmsControlTreaty);
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

      // #545 MR6 spec §12: a separate, independent condition -- not part of
      // the else-if chain above, since a civ can reasonably want both an
      // alliance and an arms-control pact with the same target. Same
      // relationship/diplomacyFocus bar as non_aggression_pact (spec's own
      // "a similar...bar" framing), plus two capability checks: the actor's
      // own known capability (self-evident, no visibility gate) and the
      // target's known capability (MR5's hasKnownStrategicCapability, via
      // the already-threaded DiplomaticContext field).
      if (
        actions.includes('arms_control_pact')
        && relationship > 0 && personality.diplomacyFocus > 0.4
        && actorHasKnownCapability
        && context.targetHasKnownStrategicCapability
      ) {
        decisions.push({ action: 'arms_control_pact', targetCiv: civId });
      }
    }
  }

  return decisions;
}
```

- [ ] **Step 4: Run tests to verify they pass, then type-check**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-diplomacy.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: FAILS — `basic-ai.ts`'s call to `evaluateDiplomacy` still passes only 9 arguments. Expected; Task 7 fixes it. Confirm the *only* build errors are in `basic-ai.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-diplomacy.ts tests/ai/ai-diplomacy.test.ts
git commit -m "feat(#545): AI arms-control-pact proposing decision (MR6 Task 6)"
```

---

### Task 7: Thread `basic-ai.ts` + decision-execution switch case

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/ai/basic-ai.test.ts`

**Interfaces:**
- Consumes: `evaluateDiplomacy`'s new signature (Task 6), `hasArmsControlTreaty`/`computeArmsControlCap` (Tasks 2, 3), `signTreaty`'s new signature (Task 3), `hasManhattanProject` (already imported via MR5's `hasKnownStrategicCapability` import — re-verify it's directly importable or import it fresh).

**This completes the build fix Task 6 left dangling — run `yarn build` again at the end of this task.**

- [ ] **Step 1: Write the failing test**

Add to `tests/ai/basic-ai.test.ts`, after the existing `describe('AI strategic launch doctrine (#545 MR5)', ...)` block:

```ts
describe('AI arms-control-pact proposing (#545 MR6)', () => {
  it('an AI with the national project, known capability, and a friendly known-capable neighbor signs a pact via processAITurn', () => {
    const state = createNewGame(undefined, 'mr6-arms-control-propose', 'small');
    const aiId = 'ai-1';
    const neighborId = 'ai-2';
    state.builtNationalProjects = { [`${aiId}:arms_control_treaty`]: { civId: aiId, cityId: 'c1', eraBuilt: 11 } };
    state.builtNationalProjects[`${aiId}:manhattan_project`] = { civId: aiId, cityId: 'c1', eraBuilt: 10 };
    state.builtNationalProjects[`${neighborId}:manhattan_project`] = { civId: neighborId, cityId: 'c2', eraBuilt: 10 };
    // getPersonality falls back to { diplomacyFocus: 0.5, ... } when
    // resolveCivDefinition finds no match for civType -- an unknown civType
    // deterministically clears this test's >0.4 bar, regardless of which
    // real civ createNewGame's seeded roster happened to assign to 'ai-1'.
    // Using whatever real civType 'ai-1' got by default would make this test
    // depend on an unrelated civ-selection seed's specific personality data.
    state.civilizations[aiId].civType = '__mr6_test_neutral_personality__';
    state.civilizations[aiId].knownCivilizations = [neighborId];
    // Spread aiId's own shape to get a full, valid Civilization object cheaply
    // (matching MR5 Task 8's proven pattern) -- but cities/units MUST be reset
    // to [], not inherited, or neighborId would silently claim ownership of
    // cities/units it doesn't actually control in state.cities/state.units,
    // confusing unrelated systems (production/military-strength scoring) that
    // this test doesn't otherwise touch. builtNationalProjects lives on
    // GameState, never on Civilization -- nothing to reset there.
    state.civilizations[neighborId] = {
      ...state.civilizations[aiId],
      id: neighborId, name: 'Neighbor', knownCivilizations: [aiId],
      cities: [], units: [],
    };
    state.civilizations[aiId].diplomacy.relationships[neighborId] = 20; // clears the >0 bar
    state.civilizations[neighborId].diplomacy.relationships[aiId] = 20;

    const result = processAITurn(state, aiId, new EventBus());

    expect(result.civilizations[aiId].diplomacy.treaties).toContainEqual(
      expect.objectContaining({ type: 'arms_control_pact', civA: aiId, civB: neighborId }),
    );
    expect(result.civilizations[neighborId].diplomacy.treaties).toContainEqual(
      expect.objectContaining({ type: 'arms_control_pact', civA: neighborId, civB: aiId }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/basic-ai.test.ts -t "arms-control-pact proposing"`
Expected: FAIL (no treaty signed — the decision is computed but never executed, matching the design review's finding #3)

- [ ] **Step 3: Implement**

In `src/ai/basic-ai.ts`, update the `diplomacyContext` construction block to compute the two new values and pass them into `evaluateDiplomacy`:

```ts
    const strategicDeterrenceCautionWeight =
      OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(newState)].strategicDeterrenceCautionWeight;
    const civHasArmsControlTreaty = hasArmsControlTreaty(newState, civId);
    const actorHasKnownCapability = hasManhattanProject(newState, civId);

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
      civHasArmsControlTreaty,
      actorHasKnownCapability,
    );
```

Add `hasArmsControlTreaty` to the existing diplomacy-system import block, and `hasManhattanProject`/`computeArmsControlCap` to the existing strategic-arsenal-system import (re-check the exact current import lines first — `hasKnownStrategicCapability` is already imported from `@/systems/strategic-arsenal-system` per MR5; add the two new names to that same import statement rather than a new one):

```ts
import { hasKnownStrategicCapability, hasManhattanProject, computeArmsControlCap } from '@/systems/strategic-arsenal-system';
```

```ts
import {
  declareWar,
  enqueuePeaceRequest,
  enqueueTreatyProposal,
  signTreaty,
  modifyRelationship,
  offerVassalage,
  joinEmbargo,
  inviteToLeague,
  getAvailableActions,
  resolveOpponentKind,
  hasArmsControlTreaty,
} from '@/systems/diplomacy-system';
```

Add a new case to the decision-execution switch, right after the closing `}` of the combined `non_aggression_pact | trade_agreement | open_borders | alliance` case:

```ts
        case 'arms_control_pact': {
          const cap = computeArmsControlCap(newState, civId, decision.targetCiv);
          // #554: humans must consent -- enqueue a proposal instead of signing.
          if (newState.civilizations[decision.targetCiv]?.isHuman) {
            newState = enqueueTreatyProposal(
              newState, civId, decision.targetCiv, decision.action, -1, bus,
            );
            break;
          }
          // AI<->AI: sign both sides immediately (existing behavior for every other treaty type).
          newState.civilizations[civId].diplomacy = signTreaty(
            currentDiplomacy, civId, decision.targetCiv, decision.action, -1, newState.turn, cap,
          );
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = signTreaty(
              newState.civilizations[decision.targetCiv].diplomacy, decision.targetCiv, civId, decision.action,
              -1, newState.turn, cap,
            );
          }
          bus.emit('diplomacy:treaty-accepted', { civA: civId, civB: decision.targetCiv, treaty: decision.action });
          break;
        }
```

- [ ] **Step 4: Run tests to verify they pass, then full build**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/basic-ai.test.ts -t "arms-control-pact proposing"`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: FAILS at `diplomacy-panel.ts`'s `getAvailableActions` call (Task 3's other dangling gap) — expected; Task 8 fixes it.

- [ ] **Step 5: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "feat(#545): wire arms-control-pact proposal into basic-ai.ts execution (MR6 Task 7)"
```

---

### Task 8: `diplomacy-panel.ts` — `getAvailableActions` call + treaty label cap display

**Files:**
- Modify: `src/ui/diplomacy-panel.ts`
- Test: `tests/ui/diplomacy-panel.test.ts`

**Interfaces:**
- Consumes: `hasArmsControlTreaty` (Task 3), `getAvailableActions`'s new signature (Task 3).

**This closes the last build gap Task 3 left open — run `yarn build` at the end of this task and confirm it passes clean.**

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/diplomacy-panel.test.ts`, in a new `describe` block near the end of the file (after the existing `describe('strategic deterrence caution note (#545 MR5)', ...)` block):

```ts
describe('arms control pact (#545 MR6)', () => {
  it('shows the cap number in the treaty label', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeBreakaway: true, includeThirdCiv: true });
    state.civilizations.outsider.knownCivilizations = ['player'];
    state.civilizations.player.diplomacy.treaties = [
      { type: 'arms_control_pact', civA: 'player', civB: 'outsider', turnsRemaining: -1, arsenalCap: 3 },
    ];

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Arms Control Pact');
    expect(rendered).toContain('cap: 3');
  });

  it('the propose action appears once the viewer has the national project', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeBreakaway: true, includeThirdCiv: true });
    state.civilizations.outsider.knownCivilizations = ['player'];
    state.builtNationalProjects = { 'player:arms_control_treaty': { civId: 'player', cityId: 'city-capital', eraBuilt: 11 } };

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered.toLowerCase()).toContain('arms control pact');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/diplomacy-panel.test.ts`
Expected: FAIL (build error from the missing 5th argument to `getAvailableActions`, or the cap text not found)

- [ ] **Step 3: Implement**

In `src/ui/diplomacy-panel.ts`, find the `getAvailableActions` call (around where `actions` is computed in the row-building loop) and add the new argument:

```ts
    const actions = getAvailableActions(
      playerDiplomacy, civId, playerCiv.techState.completed, resolveCivilizationEra(playerCiv.techState.completed),
      hasArmsControlTreaty(state, state.currentPlayer),
    );
```

Add the import:

```ts
import { hasArmsControlTreaty } from '@/systems/diplomacy-system';
```

(Combine with the existing `diplomacy-system` import block at the top of the file rather than adding a new statement — re-check its current exact contents before editing, since MR5 didn't touch this file's import list but the exact current line needs verifying.)

Find the treaty-label mapping:

```ts
    const treaties = playerDiplomacy.treaties
      .filter(t => t.civB === civId || t.civA === civId)
      .map(t => ({ label: t.type.replace(/_/g, ' '), turns: t.turnsRemaining, type: t.type }));
```

Change it to include the cap for `arms_control_pact`:

```ts
    const treaties = playerDiplomacy.treaties
      .filter(t => t.civB === civId || t.civA === civId)
      .map(t => ({
        label: t.type === 'arms_control_pact'
          ? `Arms Control Pact (cap: ${t.arsenalCap})`
          : t.type.replace(/_/g, ' '),
        turns: t.turnsRemaining,
        type: t.type,
      }));
```

- [ ] **Step 4: Run tests to verify they pass, then full build**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/diplomacy-panel.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — this is the point where every `getAvailableActions`/`evaluateDiplomacy`/`signTreaty` call site in the codebase finally type-checks clean.

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS (full suite — first point where every caller of every changed signature has been updated)

- [ ] **Step 5: Commit**

```bash
git add src/ui/diplomacy-panel.ts tests/ui/diplomacy-panel.test.ts
git commit -m "feat(#545): diplomacy panel arms-control-pact action + cap label (MR6 Task 8)"
```

---

### Task 9: Consolidate the 4 duplicated `arsenalStatus` call sites

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `src/ai/ai-production.ts`
- Modify: `src/systems/planning-system.ts`
- Test: `tests/ai/ai-production.test.ts` (new regression, using the file's own established `warhead`-eligibility test pattern); `city-panel.ts`/`planning-system.ts`'s own existing suites provide the mechanical-replacement safety net (see Step 1 note)

**Interfaces:**
- Consumes: `getArsenalStatus` (Task 2).

**Why only one new test, not three**: `getArsenalStatus`'s own correctness (including the treaty-cap case) is already fully covered by Task 2's tests, in isolation. What Task 9 changes at each of the 4 call sites is a purely mechanical replacement — an inline `{ hasManhattanProject: ..., atCapacity: ... }` object literal becomes a call to the same-shaped shared helper — carrying low regression risk, and `city-panel.ts`'s/`planning-system.ts`'s own pre-existing test suites (unchanged by this task) already exercise `getAvailableBuildings` through those call sites and would fail if a replacement were wrong. Writing three near-identical integration tests here would be disproportionate to the actual risk. `ai-production.ts` gets a dedicated new test below because it already has an established, exact-fit test pattern for this precise scenario (`'warhead appears among AI building candidates once eligible'`) that's cheap to extend and directly proves the wiring.

- [ ] **Step 1: Write the failing test**

Add to `tests/ai/ai-production.test.ts`'s `describe('strategicArsenalValueScore (#545)', ...)` block, right after the existing `'warhead appears among AI building candidates once eligible, scored by the generic pipeline'` test (which already establishes the exact `setupState`/`grantResources`/`aggressive` fixture pattern reused here verbatim):

```ts
  it('warhead drops out of AI building candidates once an arms-control pact caps the arsenal, even with physical capacity remaining (#545 MR6)', () => {
    const state = setupState(['nuclear-weapons', 'nuclear-physics']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);
    state.civilizations['ai-1']!.strategicArsenal = 1;
    state.civilizations['ai-1']!.diplomacy.treaties = [
      { type: 'arms_control_pact', civA: 'ai-1', civB: 'ai-2', turnsRemaining: -1, arsenalCap: 1 },
    ];

    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'warhead')).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-production.test.ts -t "arms-control pact caps"`
Expected: FAIL (`warhead` still appears — the inline `atCapacity` computation in `ai-production.ts` doesn't know about treaty caps yet)

- [ ] **Step 3: Implement**

In `src/ui/city-panel.ts`, replace the inline `arsenalStatus` object (around the `getAvailableBuildings` call) with:

```ts
  const builtNPKeys = getReservedNationalProjectKeys(state, city.owner);
  const availableBuildings = getAvailableBuildings(
    city,
    currentCiv.techState.completed,
    state.map,
    playerResources,
    currentCivEra,
    builtNPKeys,
    city.owner,
    getArsenalStatus(state, city.owner),
  );
```

Update the import: replace `import { getStrategicArsenal, getStrategicArsenalCapacity, hasManhattanProject } from '@/systems/strategic-arsenal-system';` with:

```ts
import { getStrategicArsenal, getStrategicArsenalCapacity, hasManhattanProject, getArsenalStatus, getActiveArmsControlCap } from '@/systems/strategic-arsenal-system';
```

(`getStrategicArsenal`/`getStrategicArsenalCapacity`/`hasManhattanProject` stay imported — `arsenalStatusLine` still uses them directly, see Task 10.)

In `src/ai/ai-production.ts`, replace:

```ts
  const arsenalStatus = {
    hasManhattanProject: hasManhattanProject(state, civId),
    atCapacity: getStrategicArsenal(civ) >= getStrategicArsenalCapacity(state, civId),
  };
```

with:

```ts
  const arsenalStatus = getArsenalStatus(state, civId);
```

Update its import from `strategic-arsenal-system` to add `getArsenalStatus` (keep `getStrategicArsenal`/`getStrategicArsenalCapacity`/`hasManhattanProject` only if used elsewhere in the file — re-check with `grep -n "getStrategicArsenal\|getStrategicArsenalCapacity\|hasManhattanProject" src/ai/ai-production.ts` before removing any of them; if the only remaining use was this one computation, drop the now-unused imports).

In `src/systems/planning-system.ts`, apply the identical replacement at **both** of its two `arsenalStatus` computations — one inside `getIdleCityIds`, one inside `getRecommendedIdleCityChoice` — same import adjustment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/planning-system.test.ts tests/ai/ai-production.test.ts tests/ui/city-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel.ts src/ai/ai-production.ts src/systems/planning-system.ts tests/ai/ai-production.test.ts
git commit -m "feat(#545): consolidate arsenalStatus computation into getArsenalStatus (MR6 Task 9)"
```

---

### Task 10: UI surfacing — Strategic Arsenal panel + city panel effective-cap display

**Files:**
- Modify: `src/systems/strategic-arsenal-summary-presentation.ts`
- Modify: `src/ui/strategic-arsenal-panel.ts`
- Modify: `src/ui/city-panel.ts`
- Test: `tests/systems/strategic-arsenal-summary-presentation.test.ts`, `tests/ui/strategic-arsenal-panel.test.ts`, `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `getActiveArmsControlCap` (Task 2, already imported into `city-panel.ts` in Task 9).

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/strategic-arsenal-summary-presentation.test.ts`. **This file's `makeState` inlines the civ object directly (no separate `makeCiv` helper exists here) and uses loose `as any` typing** — match that exactly, don't reuse `strategic-arsenal-system.test.ts`'s stricter `makeCiv` pattern, they're different files with different conventions:

```ts
it('activeArmsControlCap is null with no active pact', () => {
  const presentation = getStrategicArsenalSummaryPresentation(makeState(), 'p1');
  expect(presentation.activeArmsControlCap).toBeNull();
});

it('activeArmsControlCap surfaces the active pact cap', () => {
  const state = makeState({
    civilizations: {
      p1: {
        id: 'p1', cities: [], units: [], strategicArsenal: 2,
        diplomacy: { strategicStrikesReceivedFrom: ['p2'], treaties: [{ type: 'arms_control_pact', civA: 'p1', civB: 'p2', turnsRemaining: -1, arsenalCap: 4 }] },
      } as any,
    },
  });
  expect(getStrategicArsenalSummaryPresentation(state, 'p1').activeArmsControlCap).toBe(4);
});
```

**`tests/ui/strategic-arsenal-panel.test.ts` already has a test that will break as soon as `activeArmsControlCap` becomes a required field** — `'never fabricates an arms-control-cap or retaliation-risk line (MR5/MR6 not built yet)'` (line 22) constructs a presentation literal without it, which won't type-check once the interface requires it. Update **all three** existing presentation literals in this file to add `activeArmsControlCap: null`, and rename/refocus that specific test now that MR6 *is* built — its "no cap → no cap text" intent stays exactly the same, only the comment claiming it's unbuilt is now wrong:

```ts
describe('createStrategicArsenalPanel (#545 MR4)', () => {
  it('renders arsenal count/capacity and closes via callback', () => {
    const container = document.createElement('div');
    const onClose = vi.fn();
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: [], activeArmsControlCap: null }, onClose);
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('3');
    (container.querySelector('[aria-label="Close"]') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows how many civs have struck this civ when non-zero', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: ['p2'], activeArmsControlCap: null }, vi.fn());
    expect(container.textContent).toContain('1 civilization');
  });

  it('omits the arms-control-cap and retaliation-risk lines when there is no active cap (#545 MR6: cap line now exists, gated correctly)', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: [], activeArmsControlCap: null }, vi.fn());
    expect(container.textContent).not.toMatch(/arms.control/i);
    expect(container.textContent).not.toMatch(/retaliation.risk/i);
  });

  it('shows the active arms-control cap when present (#545 MR6)', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 2, arsenalCapacity: 5, platforms: [], strikesReceivedFromCivIds: [], activeArmsControlCap: 3 }, vi.fn());
    expect(container.textContent).toMatch(/arms.control.*cap.*3/i);
  });
});
```

Add to `tests/ui/city-panel.test.ts`'s existing `describe('city-panel warhead arsenal visibility (#545)', ...)` block, right after the existing `'available warhead item shows an always-visible Arsenal: N/M line'` test (which already establishes the exact `makeWonderPanelFixture`/`collectText` pattern reused here verbatim):

```ts
  it('the warhead arsenal line reflects the effective (treaty, not just physical) cap (#545 MR6)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed.push('nuclear-weapons', 'nuclear-physics');
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId, resource: 'uranium', expiresOnTurn: state.turn + 1 },
    ] };
    // Physical capacity: base 1 + nuclear_arsenal (+2) + missile_silo (+1) = 4.
    // An active arms-control pact caps at 2 -- stricter than physical capacity,
    // so the displayed line must show the EFFECTIVE cap (2), not 4.
    city.buildings.push('nuclear_arsenal', 'missile_silo');
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 2;
    state.civilizations[civId].diplomacy.treaties = [
      { type: 'arms_control_pact', civA: civId, civB: 'ai-1', turnsRemaining: -1, arsenalCap: 2 },
    ];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).toContain('Arsenal: 2/2');
    expect(collectText(panel)).not.toContain('Arsenal: 2/4');
    expect(collectText(panel)).toContain('Limited by an active arms control pact.');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-summary-presentation.test.ts tests/ui/strategic-arsenal-panel.test.ts`
Expected: FAIL (`activeArmsControlCap` undefined / not read)

- [ ] **Step 3: Implement**

In `src/systems/strategic-arsenal-summary-presentation.ts`:

```ts
import type { GameState } from '@/core/types';
import { getStrategicArsenal, getStrategicArsenalCapacity, getActiveArmsControlCap } from '@/systems/strategic-arsenal-system';
import { getEligibleStrategicLaunchPlatforms, type StrategicLaunchPlatform } from '@/systems/strategic-launch-system';

export interface StrategicArsenalSummaryPresentation {
  arsenalCount: number;
  arsenalCapacity: number;
  platforms: StrategicLaunchPlatform[];
  strikesReceivedFromCivIds: string[];
  // #545 MR6: the most-restrictive active arms-control pact cap, or null.
  activeArmsControlCap: number | null;
}

export function getStrategicArsenalSummaryPresentation(
  state: GameState,
  civId: string,
): StrategicArsenalSummaryPresentation {
  const civ = state.civilizations[civId];
  return {
    arsenalCount: civ ? getStrategicArsenal(civ) : 0,
    arsenalCapacity: getStrategicArsenalCapacity(state, civId),
    platforms: getEligibleStrategicLaunchPlatforms(state, civId),
    strikesReceivedFromCivIds: civ?.diplomacy.strategicStrikesReceivedFrom ?? [],
    activeArmsControlCap: getActiveArmsControlCap(state, civId),
  };
}
```

In `src/ui/strategic-arsenal-panel.ts`, add after the `arsenalLine` block:

```ts
  if (presentation.activeArmsControlCap !== null) {
    const capLine = document.createElement('div');
    capLine.textContent = `Arms control cap: ${presentation.activeArmsControlCap}`;
    capLine.style.cssText = 'margin-bottom:10px;font-size:13px;opacity:0.85;';
    card.appendChild(capLine);
  }
```

In `src/ui/city-panel.ts`, replace the `arsenalStatusLine` function:

```ts
  // #545 MR5/MR6: always-visible arsenal count on the available warhead item --
  // the locked-item reason (below) only shows once at capacity, while under
  // capacity this is the only place a player can see their current
  // count/capacity. MR6: shows the EFFECTIVE cap (min of physical and any
  // active arms-control treaty cap), never just the physical number, so the
  // displayed count never contradicts why production is blocked -- plus a
  // distinct note when a treaty is the binding constraint.
  const arsenalStatusLine = (itemId: string): string => {
    if (itemId !== 'warhead') return '';
    const current = getStrategicArsenal(currentCiv);
    const physicalCapacity = getStrategicArsenalCapacity(state, city.owner);
    const treatyCap = getActiveArmsControlCap(state, city.owner);
    const effectiveCapacity = treatyCap !== null ? Math.min(physicalCapacity, treatyCap) : physicalCapacity;
    const treatyNote = treatyCap !== null && treatyCap < physicalCapacity
      ? '<div style="font-size:10px;opacity:0.72;color:#e8c170;">Limited by an active arms control pact.</div>'
      : '';
    return `<div style="font-size:10px;opacity:0.72;">Arsenal: ${current}/${effectiveCapacity}</div>${treatyNote}`;
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-summary-presentation.test.ts tests/ui/strategic-arsenal-panel.test.ts tests/ui/city-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/strategic-arsenal-summary-presentation.ts src/ui/strategic-arsenal-panel.ts src/ui/city-panel.ts tests/systems/strategic-arsenal-summary-presentation.test.ts tests/ui/strategic-arsenal-panel.test.ts tests/ui/city-panel.test.ts
git commit -m "feat(#545): surface active arms-control cap in Strategic Arsenal + city panels (MR6 Task 10)"
```

---

### Task 11: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — full suite. Pay particular attention to:
- `tests/systems/national-project-balance.test.ts` (unaffected — Arms Control Treaty NP's existing `civYieldBonus: { gold: 5 }` is untouched)
- `tests/systems/pacing-audit.test.ts` (unaffected — no yield/economy change)
- `tests/app/architecture-boundaries.test.ts` (no new composition-root surface; all new logic lives in existing `src/systems/`/`src/ai/`/`src/ui/` files, matching established patterns)

- [ ] **Step 2: Run the production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS clean, zero TypeScript errors.

- [ ] **Step 3: Manual sanity pass**

If a browser preview is practical (check port availability first — do not kill a process you don't own), start a new game, complete Arms Control Treaty NP on the player's civ via console/save-edit if needed, and confirm the "Arms Control Pact" action appears in the diplomacy panel once available. If not practical, skip this step and say so explicitly rather than claiming visual verification that didn't happen — the jsdom-based tests in Tasks 8 and 10 already assert the exact rendered text under precise state conditions.

- [ ] **Step 4: Tick every checkbox in this plan document**

Go back through every task above and mark its checkboxes complete.

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/plans/2026-08-27-issue-545-mr6-arms-control.md
git commit -m "docs(#545): mark MR6 plan doc executed, tick all task/DoD checkboxes"
```

At this point the branch is ready for the standard finishing-a-development-branch flow (push, open PR with "Part of #545" — never "Closes #545" — watch CI, request review); that is a separate decision for the user to trigger, not part of this implementation plan.
