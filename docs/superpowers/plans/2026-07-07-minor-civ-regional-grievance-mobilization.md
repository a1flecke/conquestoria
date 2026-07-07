# Minor Civ Regional Grievance And Mobilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build issue 355 as a local regional grievance, mobilization, recovery, and coalition-war system for minor civilizations without magical free armies or Era 1 dogpiles.

**Architecture:** Add focused minor-civ coalition and mobilization system helpers that return immutable `GameState` updates plus explicit transition payloads. Wire conquest, turn processing, minor-civ actions, save normalization, notifications, and the diplomacy panel through those helpers while preserving viewer-safe presentation.

**Tech Stack:** TypeScript, Vite, Vitest, DOM/CSS UI, existing `EventBus`, existing save normalization in `src/storage/save-manager.ts`.

---

## Spec And Rule References

- Spec: `docs/superpowers/specs/2026-07-07-minor-civ-regional-grievance-mobilization-design.md`
- Rules to keep open while implementing:
  - `.claude/rules/game-systems.md`
  - `.claude/rules/strategy-game-mechanics.md`
  - `.claude/rules/end-to-end-wiring.md`
  - `.claude/rules/ui-panels.md`
  - `.claude/rules/spec-fidelity.md`
  - `docs/superpowers/plans/README.md`

## Concrete Tuning For This Implementation

- Local grievance radius: `14` hexes, using wrapped distance. City-state placement keeps minor civs at least `10` hexes apart, so `14` is the minimum practical regional radius that can reliably catch nearby peers without becoming global.
- Pressure thresholds:
  - `wary`: `20`
  - `mobilizing`: `45`
  - `coalition-talks`: `70`
- Base conquest pressure: `35`.
- Repeated conquest pressure: +`15` if same aggressor caused regional aggression in the last `12` turns.
- Relationship penalty from conquest spillover: `-10` at local radius edge, up to `-20` near the victim; cultural and mercantile city-states get an additional `-5`; militaristic city-states get +`5` pressure instead.
- Era 1: no formal coalition records and no coalition war.
- Regional maturity gate: at least two eligible member cities and either total member population >= `6` or at least two living member combat units. Era alone is not enough.
- Talks countdown by challenge:
  - Explorer: `6` turns
  - Standard: `4` turns
  - Veteran: `3` turns
- Pair cooldown after coalition war/cooling: `18` turns.
- Regional cooldown after coalition war/cooling: `12` turns.
- Pressure decay per turn with no new aggression:
  - Explorer: `3`
  - Standard: `2`
  - Veteran: `1`
- Reparations:
  - Cost: `40 + era * 10`.
  - Pressure reduction: `20`.
  - Relationship boost: `8`.
  - Allowed only for active grievance/cooling pressure and not while at war.
- Mobilization:
  - Progress per turn by challenge: Explorer `6`, Standard `8`, Veteran `10`.
  - Trained defender threshold: `24`.
  - Conscription threshold: pressure >= `80` or direct war/coalition war.
  - Conscription requires city population >= `3`.
  - Conscription spends `1` population, creates era defender at `65` health, sets `conscriptCooldownUntil = turn + 10`, and `strainedUntil = turn + 6`.
  - Trained defender uses era defender at `100` health and does not cost population.
- Era defender map for minimal implementation:
  - Era 1: `warrior`
  - Era 2: `swordsman`
  - Era 3: `pikeman`
  - Era 4+: `musketeer` until current minor-civ era-upgrade rules move later eras.

## Files And Responsibilities

- Create `src/systems/minor-civ-coalition-system.ts`: helpers for immutable grievance state updates, posture evaluation, conquest recording, pressure decay, coalition talks, coalition war, recovery, normalization, presentation summaries, and transition emission.
- Modify `src/core/types.ts`: add coalition/grievance types, `MinorCivState.regionalGrievanceByCiv`, `GameState.minorCivCoalitions`, `GameState.minorCivRegionalCooldowns`, and new `GameEvents`.
- Modify `src/systems/minor-civ-system.ts`: replace global conquest penalty, call grievance helper, process turn-time grievance/mobilization, emit transitions.
- Modify `src/systems/minor-civ-actions.ts`: add reparations quote/action and use recovery helper.
- Modify `src/systems/minor-civ-presentation.ts`: add viewer-safe coalition posture/cause/recovery presentation.
- Modify `src/ui/diplomacy-panel.ts`: show posture labels, cause/recovery text, and reparations button while preserving existing actions.
- Modify `src/ui/minor-civ-notifications.ts` and `src/ui/minor-civ-notification-listeners.ts`: route coalition/grievance/reparations/conscription notifications.
- Modify `src/ui/advisor-system.ts`: add actionable chancellor warning for meaningful coalition escalation.
- Modify `src/storage/save-manager.ts`: normalize coalition/grievance state for legacy solo and hot-seat saves.
- Tests:
  - `tests/systems/minor-civ-coalition-system.test.ts`
  - `tests/systems/minor-civ-system.test.ts`
  - `tests/systems/minor-civ-actions.test.ts`
  - `tests/storage/save-persistence.test.ts`
  - `tests/ui/diplomacy-panel.test.ts`
  - `tests/ui/minor-civ-notifications.test.ts`
  - `tests/ui/minor-civ-notification-listeners.test.ts`
  - `tests/ui/advisor-system.test.ts`

## Player Truth Table

| Before | Action | Internal State | Immediate Visible Result |
|---|---|---|---|
| Discovered city-state row shows normal relationship and existing gift/war actions | Player conquers nearby city-state, then opens diplomacy | Nearby city-state gets local grievance and posture `Wary` or `Mobilizing` | Row shows posture label and short cause; existing gift/festival/war actions remain reachable |
| Row shows `Wary` or `Mobilizing`, player has enough gold | Click `Offer Reparations` | Gold decreases, pressure decreases, relationship improves, transition emitted | Open panel rerenders; cost no longer chargeable from stale DOM; posture/cause text updates |
| Row shows `Offer Reparations` but player lacks gold | Click unavailable reparations button | No state change | Button is disabled and visible reason says required gold |
| Era 1 city-state rush creates pressure | Advance turns | Pressure may decay/mobilize but no coalition record is created | Notifications/advisor may warn; no coalition war appears |
| Era 2+ mature region has coalition talks | Advance countdown turns | Coalition status changes from `talks` to `war`, canonical war helper updates both sides | Notification and log warn the target; diplomacy row shows `At War` |

## Misleading UI Risks

- `Coalition Talks` must not appear in Era 1. Negative test: Era 1 high pressure stays `Mobilizing`.
- `Offer Reparations` must not appear as available while at war, without active grievance, or when unaffordable. Negative tests cover each condition.
- Cause text must not show undiscovered city-state names. Negative test uses hidden victim/source IDs.
- Coalition recovery UI must not replace normal minor-civ actions. Test asserts gift and war/peace remain reachable beside reparations.
- Exact hidden pressure values must not be rendered in the diplomacy panel.

## Interaction Replay Checklist

- Open diplomacy after grievance appears.
- Pay reparations once and assert panel rerenders.
- Repeat-click the stale reparations button and assert gold is not deducted twice.
- Reopen diplomacy and assert updated posture persists.
- Attempt reparations while unaffordable and assert disabled reason.
- Open hot-seat diplomacy as another player and assert no hidden cause leak.

## Task 1: Types And Normalization Skeleton

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/minor-civ-coalition-system.ts`
- Modify: `src/storage/save-manager.ts`
- Test: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Write failing save normalization tests**

Add tests to `tests/storage/save-persistence.test.ts`:

```ts
it('normalizes legacy minor-civ coalition fields for solo saves', () => {
  const state = createNewGame(undefined, 'legacy-coalition-solo', 'small');
  const minorCiv = Object.values(state.minorCivs)[0];
  delete (minorCiv as any).regionalGrievanceByCiv;
  delete (state as any).minorCivCoalitions;
  delete (state as any).minorCivRegionalCooldowns;

  const loaded = normalizeLoadedStateForTest(state);

  expect(loaded.minorCivs[minorCiv.id].regionalGrievanceByCiv).toEqual({});
  expect(loaded.minorCivCoalitions).toEqual({});
  expect(loaded.minorCivRegionalCooldowns).toEqual({});
});

it('drops malformed coalition records and preserves valid hot-seat viewer-safe pending events', () => {
  const state = createHotSeatGame({
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
    ],
  }, 'legacy-coalition-hotseat');
  const minorCiv = Object.values(state.minorCivs)[0];
  (minorCiv as any).regionalGrievanceByCiv = {
    'player-1': {
      aggressorCivId: 'player-1',
      pressure: 72,
      posture: 'mobilizing',
      lastAggressionTurn: state.turn,
      lastPostureChangeTurn: state.turn,
      causes: [{ type: 'minor-civ-conquered', turn: state.turn, sourceMinorCivId: minorCiv.id, pressureDelta: 35, relationshipDelta: -15 }],
      mobilizationProgress: 8,
    },
  };
  (state as any).minorCivCoalitions = {
    'bad-coalition': { id: 'bad-coalition', targetCivId: 'player-1', memberIds: ['missing-mc'], regionKey: 'r', status: 'war', formedTurn: state.turn, warEligibleOnTurn: state.turn },
  };
  state.pendingEvents = { 'player-1': [{ type: 'minor-civ:coalition', message: 'A known city-state is wary.', turn: state.turn }] };

  const loaded = normalizeLoadedStateForTest(state);

  expect(loaded.minorCivs[minorCiv.id].regionalGrievanceByCiv['player-1'].posture).toBe('mobilizing');
  expect(loaded.minorCivCoalitions).toEqual({});
  expect(loaded.pendingEvents?.['player-1']?.[0]?.message).toBe('A known city-state is wary.');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts`

Expected: FAIL because `regionalGrievanceByCiv`, `minorCivCoalitions`, and `minorCivRegionalCooldowns` do not exist or are not normalized.

- [ ] **Step 3: Add types and normalization helpers**

In `src/core/types.ts`, add:

```ts
export type MinorCivGrievanceCauseType =
  | 'minor-civ-conquered' | 'minor-civ-attacked' | 'coalition-war'
  | 'reparations' | 'quest-completed' | 'festival-sponsored'
  | 'threat-defeated' | 'city-liberated' | 'city-returned' | 'time-decay';

export interface MinorCivGrievanceCause {
  type: MinorCivGrievanceCauseType;
  turn: number;
  sourceMinorCivId?: string;
  cityId?: string;
  pressureDelta: number;
  relationshipDelta: number;
}

export type MinorCivCoalitionPosture = 'none' | 'wary' | 'mobilizing' | 'coalition-talks' | 'at-war' | 'cooling-down';

export interface MinorCivRegionalGrievance {
  aggressorCivId: string;
  pressure: number;
  posture: MinorCivCoalitionPosture;
  lastAggressionTurn: number;
  lastPostureChangeTurn: number;
  causes: MinorCivGrievanceCause[];
  coalitionId?: string;
  talksStartedTurn?: number;
  warEligibleOnTurn?: number;
  pairCooldownUntil?: number;
  conscriptCooldownUntil?: number;
  strainedUntil?: number;
  mobilizationProgress?: number;
}

export interface MinorCivCoalitionRecord {
  id: string;
  targetCivId: string;
  memberIds: string[];
  regionKey: string;
  status: 'talks' | 'war' | 'cooling-down' | 'dissolved';
  formedTurn: number;
  warEligibleOnTurn: number;
  cooldownUntil?: number;
}
```

Add `regionalGrievanceByCiv: Record<string, MinorCivRegionalGrievance>;` to `MinorCivState`.

Add optional `minorCivCoalitions?: Record<string, MinorCivCoalitionRecord>;` and `minorCivRegionalCooldowns?: Record<string, { targetCivId: string; memberIds: string[]; cooldownUntil: number }>;` to `GameState`.

Create `src/systems/minor-civ-coalition-system.ts` with:

```ts
import type {
  GameState,
  MinorCivCoalitionPosture,
  MinorCivCoalitionRecord,
  MinorCivGrievanceCause,
  MinorCivRegionalGrievance,
} from '@/core/types';

export const MINOR_CIV_GRIEVANCE_RADIUS = 14;
export const MINOR_CIV_REPARATIONS_BASE_COST = 40;

const VALID_POSTURES = new Set<MinorCivCoalitionPosture>([
  'none', 'wary', 'mobilizing', 'coalition-talks', 'at-war', 'cooling-down',
]);
const VALID_CAUSES = new Set([
  'minor-civ-conquered', 'minor-civ-attacked', 'coalition-war',
  'reparations', 'quest-completed', 'festival-sponsored',
  'threat-defeated', 'city-liberated', 'city-returned', 'time-decay',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeCause(value: unknown): MinorCivGrievanceCause | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !VALID_CAUSES.has(value.type)) return null;
  if (!Number.isFinite(value.turn) || !Number.isFinite(value.pressureDelta) || !Number.isFinite(value.relationshipDelta)) return null;
  return {
    type: value.type as MinorCivGrievanceCause['type'],
    turn: Number(value.turn),
    sourceMinorCivId: typeof value.sourceMinorCivId === 'string' ? value.sourceMinorCivId : undefined,
    cityId: typeof value.cityId === 'string' ? value.cityId : undefined,
    pressureDelta: Number(value.pressureDelta),
    relationshipDelta: Number(value.relationshipDelta),
  };
}

export function normalizeMinorCivCoalitionState(state: GameState): GameState {
  const minorCivs = { ...(state.minorCivs ?? {}) };
  for (const [minorCivId, minorCiv] of Object.entries(minorCivs)) {
    const raw = (minorCiv as any).regionalGrievanceByCiv;
    const normalized: Record<string, MinorCivRegionalGrievance> = {};
    if (isRecord(raw)) {
      for (const [majorCivId, value] of Object.entries(raw)) {
        if (!state.civilizations?.[majorCivId] || !isRecord(value)) continue;
        if (typeof value.aggressorCivId !== 'string' || value.aggressorCivId !== majorCivId) continue;
        if (!Number.isFinite(value.pressure) || typeof value.posture !== 'string' || !VALID_POSTURES.has(value.posture as MinorCivCoalitionPosture)) continue;
        const causes = Array.isArray(value.causes) ? value.causes.map(normalizeCause).filter(cause => cause !== null) : [];
        normalized[majorCivId] = {
          aggressorCivId: majorCivId,
          pressure: Math.max(0, Math.min(100, Number(value.pressure))),
          posture: value.posture as MinorCivCoalitionPosture,
          lastAggressionTurn: Number.isFinite(value.lastAggressionTurn) ? Number(value.lastAggressionTurn) : state.turn,
          lastPostureChangeTurn: Number.isFinite(value.lastPostureChangeTurn) ? Number(value.lastPostureChangeTurn) : state.turn,
          causes,
          coalitionId: typeof value.coalitionId === 'string' ? value.coalitionId : undefined,
          talksStartedTurn: Number.isFinite(value.talksStartedTurn) ? Number(value.talksStartedTurn) : undefined,
          warEligibleOnTurn: Number.isFinite(value.warEligibleOnTurn) ? Number(value.warEligibleOnTurn) : undefined,
          pairCooldownUntil: Number.isFinite(value.pairCooldownUntil) ? Number(value.pairCooldownUntil) : undefined,
          conscriptCooldownUntil: Number.isFinite(value.conscriptCooldownUntil) ? Number(value.conscriptCooldownUntil) : undefined,
          strainedUntil: Number.isFinite(value.strainedUntil) ? Number(value.strainedUntil) : undefined,
          mobilizationProgress: Number.isFinite(value.mobilizationProgress) ? Number(value.mobilizationProgress) : 0,
        };
      }
    }
    minorCivs[minorCivId] = { ...minorCiv, regionalGrievanceByCiv: normalized };
  }

  const coalitions: Record<string, MinorCivCoalitionRecord> = {};
  const rawCoalitions = (state as any).minorCivCoalitions;
  if (isRecord(rawCoalitions)) {
    for (const [id, value] of Object.entries(rawCoalitions)) {
      if (!isRecord(value) || typeof value.targetCivId !== 'string' || !state.civilizations?.[value.targetCivId]) continue;
      if (!Array.isArray(value.memberIds) || value.memberIds.some(memberId => typeof memberId !== 'string' || !minorCivs[memberId])) continue;
      if (typeof value.regionKey !== 'string' || typeof value.status !== 'string') continue;
      if (!['talks', 'war', 'cooling-down', 'dissolved'].includes(value.status)) continue;
      if (!Number.isFinite(value.formedTurn) || !Number.isFinite(value.warEligibleOnTurn)) continue;
      coalitions[id] = {
        id,
        targetCivId: value.targetCivId,
        memberIds: [...value.memberIds].sort(),
        regionKey: value.regionKey,
        status: value.status as MinorCivCoalitionRecord['status'],
        formedTurn: Number(value.formedTurn),
        warEligibleOnTurn: Number(value.warEligibleOnTurn),
        cooldownUntil: Number.isFinite(value.cooldownUntil) ? Number(value.cooldownUntil) : undefined,
      };
    }
  }

  const regionalCooldowns: GameState['minorCivRegionalCooldowns'] = {};
  const rawCooldowns = (state as any).minorCivRegionalCooldowns;
  if (isRecord(rawCooldowns)) {
    for (const [key, value] of Object.entries(rawCooldowns)) {
      if (!isRecord(value) || typeof value.targetCivId !== 'string' || !state.civilizations?.[value.targetCivId]) continue;
      if (!Array.isArray(value.memberIds) || value.memberIds.some(memberId => typeof memberId !== 'string' || !minorCivs[memberId])) continue;
      if (!Number.isFinite(value.cooldownUntil)) continue;
      regionalCooldowns[key] = {
        targetCivId: value.targetCivId,
        memberIds: [...value.memberIds].sort(),
        cooldownUntil: Number(value.cooldownUntil),
      };
    }
  }

  return { ...state, minorCivs, minorCivCoalitions: coalitions, minorCivRegionalCooldowns: regionalCooldowns };
}
```

Call `normalizeMinorCivCoalitionState` from `normalizeLoadedState` after `normalizeMinorCivQuestState`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/core/types.ts src/systems/minor-civ-coalition-system.ts src/storage/save-manager.ts tests/storage/save-persistence.test.ts
git commit -m "feat(minor-civs): normalize coalition grievance state"
```

## Task 2: Local Conquest Grievance

**Files:**
- Modify: `src/systems/minor-civ-coalition-system.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Test: `tests/systems/minor-civ-system.test.ts`
- Test: `tests/systems/minor-civ-coalition-system.test.ts`

- [ ] **Step 1: Write failing local spillover tests**

Replace the existing `applies conquest penalty to other minor civs` test in `tests/systems/minor-civ-system.test.ts` with tests that build deterministic local/distant minor civs:

```ts
it('records local grievance instead of penalizing every surviving minor civ globally', () => {
  const state = createNewGame(undefined, 'mc-local-grievance', 'medium');
  const [victimId, nearId, farId] = Object.keys(state.minorCivs);
  if (!victimId || !nearId || !farId) throw new Error('Expected at least three minor civs');
  state.cities[state.minorCivs[victimId].cityId].position = { q: 0, r: 0 };
  state.cities[state.minorCivs[nearId].cityId].position = { q: 4, r: 0 };
  state.cities[state.minorCivs[farId].cityId].position = { q: 30, r: 0 };

  const result = conquestMinorCiv(state, victimId, 'player');

  expect(result.state.minorCivs[nearId].regionalGrievanceByCiv.player?.pressure).toBeGreaterThan(0);
  expect(result.state.minorCivs[nearId].diplomacy.relationships.player).toBeLessThan(0);
  expect(result.state.minorCivs[farId].regionalGrievanceByCiv.player).toBeUndefined();
  expect(result.state.minorCivs[farId].diplomacy.relationships.player).toBe(0);
});

it('records regional grievance for AI conquest through the same conquest helper', () => {
  const state = createNewGame(undefined, 'mc-ai-local-grievance', 'medium');
  const [victimId, nearId] = Object.keys(state.minorCivs);
  const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  if (!victimId || !nearId || !aiId) throw new Error('Expected victim, neighbor, and AI');
  state.cities[state.minorCivs[victimId].cityId].position = { q: 0, r: 0 };
  state.cities[state.minorCivs[nearId].cityId].position = { q: 4, r: 0 };

  const result = conquestMinorCiv(state, victimId, aiId);

  expect(result.state.minorCivs[nearId].regionalGrievanceByCiv[aiId]?.pressure).toBeGreaterThan(0);
  expect(result.state.minorCivs[nearId].diplomacy.relationships[aiId]).toBeLessThan(0);
});
```

Create `tests/systems/minor-civ-coalition-system.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { recordMinorCivRegionalAggression } from '@/systems/minor-civ-coalition-system';

describe('minor-civ regional grievance', () => {
  it('uses wrapped distance when the map wraps horizontally', () => {
    const state = createNewGame(undefined, 'mc-wrapped-grievance', 'medium');
    state.map.wrapsHorizontally = true;
    state.map.width = 40;
    const [victimId, nearWrappedId] = Object.keys(state.minorCivs);
    if (!victimId || !nearWrappedId) throw new Error('Expected minor civs');
    state.cities[state.minorCivs[victimId].cityId].position = { q: 0, r: 0 };
    state.cities[state.minorCivs[nearWrappedId].cityId].position = { q: 39, r: 0 };

    const result = recordMinorCivRegionalAggression(state, {
      aggressorCivId: 'player',
      victimMinorCivId: victimId,
      type: 'minor-civ-conquered',
    });

    expect(result.state.minorCivs[nearWrappedId].regionalGrievanceByCiv.player?.pressure).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-coalition-system.test.ts`

Expected: FAIL because local grievance helper does not exist and conquest still penalizes all minor civs.

- [ ] **Step 3: Implement local aggression helper and wire conquest**

Add exported transition/result types and helper to `src/systems/minor-civ-coalition-system.ts`:

```ts
export type MinorCivCoalitionTransition =
  | { type: 'grievance-recorded'; minorCivId: string; targetCivId: string; cause: MinorCivGrievanceCause; oldPosture: MinorCivCoalitionPosture; newPosture: MinorCivCoalitionPosture };

export interface RegionalAggressionInput {
  aggressorCivId: string;
  victimMinorCivId: string;
  type: Extract<MinorCivGrievanceCauseType, 'minor-civ-conquered' | 'minor-civ-attacked'>;
}

export interface CoalitionUpdateResult {
  state: GameState;
  transitions: MinorCivCoalitionTransition[];
}

export function evaluateCoalitionPosture(pressure: number): MinorCivCoalitionPosture {
  if (pressure >= 70) return 'coalition-talks';
  if (pressure >= 45) return 'mobilizing';
  if (pressure >= 20) return 'wary';
  return 'none';
}

function clampPressure(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function localDistance(state: GameState, a: HexCoord, b: HexCoord): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(a, b, state.map.width) : hexDistance(a, b);
}

function recordForMinor(nextState: GameState, minorCivId: string, aggressorCivId: string, cause: MinorCivGrievanceCause): MinorCivCoalitionTransition | null {
  const minor = nextState.minorCivs[minorCivId];
  if (!minor || minor.isDestroyed) return null;
  const previous = minor.regionalGrievanceByCiv?.[aggressorCivId];
  const oldPosture = previous?.posture ?? 'none';
  const pressure = clampPressure((previous?.pressure ?? 0) + cause.pressureDelta);
  const newPosture = nextState.era <= 1 && evaluateCoalitionPosture(pressure) === 'coalition-talks'
    ? 'mobilizing'
    : evaluateCoalitionPosture(pressure);
  const regionalGrievanceByCiv = { ...(minor.regionalGrievanceByCiv ?? {}) };
  regionalGrievanceByCiv[aggressorCivId] = {
    aggressorCivId,
    pressure,
    posture: newPosture,
    lastAggressionTurn: cause.turn,
    lastPostureChangeTurn: oldPosture === newPosture ? (previous?.lastPostureChangeTurn ?? cause.turn) : cause.turn,
    causes: [...(previous?.causes ?? []), cause].slice(-8),
    mobilizationProgress: previous?.mobilizationProgress ?? 0,
    pairCooldownUntil: previous?.pairCooldownUntil,
    conscriptCooldownUntil: previous?.conscriptCooldownUntil,
    strainedUntil: previous?.strainedUntil,
  };
  nextState.minorCivs[minorCivId] = {
    ...minor,
    diplomacy: modifyRelationship(minor.diplomacy, aggressorCivId, cause.relationshipDelta),
    regionalGrievanceByCiv,
  };
  return { type: 'grievance-recorded', minorCivId, targetCivId: aggressorCivId, cause, oldPosture, newPosture };
}

export function recordMinorCivRegionalAggression(state: GameState, input: RegionalAggressionInput): CoalitionUpdateResult {
  const victim = state.minorCivs[input.victimMinorCivId];
  const victimCity = victim ? state.cities[victim.cityId] : undefined;
  if (!victim || !victimCity || !state.civilizations[input.aggressorCivId]) return { state, transitions: [] };
  const nextState = normalizeMinorCivCoalitionState(structuredClone(state));
  const transitions: MinorCivCoalitionTransition[] = [];
  for (const [minorCivId, minor] of Object.entries(nextState.minorCivs)) {
    if (minorCivId === input.victimMinorCivId || minor.isDestroyed) continue;
    const city = nextState.cities[minor.cityId];
    if (!city) continue;
    const distance = localDistance(nextState, victimCity.position, city.position);
    if (distance > MINOR_CIV_GRIEVANCE_RADIUS) continue;
    const def = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minor.definitionId);
    const distancePressure = Math.max(0, MINOR_CIV_GRIEVANCE_RADIUS - distance);
    const recentAggression = Object.values(minor.regionalGrievanceByCiv ?? {}).some(grievance =>
      grievance.aggressorCivId === input.aggressorCivId && state.turn - grievance.lastAggressionTurn <= 12);
    const archetypePressure = def?.archetype === 'militaristic' ? 5 : 0;
    const relationshipDelta = -10 - Math.max(0, Math.min(10, distancePressure)) - (def?.archetype === 'cultural' || def?.archetype === 'mercantile' ? 5 : 0);
    const cause: MinorCivGrievanceCause = {
      type: input.type,
      turn: state.turn,
      sourceMinorCivId: input.victimMinorCivId,
      cityId: victim.cityId,
      pressureDelta: 35 + distancePressure + archetypePressure + (recentAggression ? 15 : 0),
      relationshipDelta,
    };
    const transition = recordForMinor(nextState, minorCivId, input.aggressorCivId, cause);
    if (transition) transitions.push(transition);
  }
  return { state: nextState, transitions };
}
```

Update imports for `HexCoord`, `MinorCivGrievanceCauseType`, `hexDistance`, `wrappedHexDistance`, `modifyRelationship`, and `MINOR_CIV_DEFINITIONS`.

In `conquestMinorCiv`, remove the loop that applies a penalty to every other minor civ. After city/unit cleanup, call:

```ts
const grievance = recordMinorCivRegionalAggression(nextState, {
  aggressorCivId: conquerorId,
  victimMinorCivId: mcId,
  type: 'minor-civ-conquered',
});
return { state: grievance.state, transitions: [...transitions, ...grievance.transitions], conquered: true };
```

Broaden the `transitions` return type to include `MinorCivCoalitionTransition`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-coalition-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-coalition-system.test.ts
git commit -m "feat(minor-civs): record local conquest grievance"
```

## Task 3: Turn-Time Decay, Maturity, Talks, War, And Mobilization

**Files:**
- Modify: `src/systems/minor-civ-coalition-system.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Test: `tests/systems/minor-civ-coalition-system.test.ts`

- [ ] **Step 1: Write failing turn-processing tests**

Add tests:

```ts
it('blocks formal coalition talks and war in era 1 even at high pressure', () => {
  const state = createNewGame(undefined, 'mc-era1-blocks-coalition', 'medium');
  state.era = 1;
  const [a, b] = Object.keys(state.minorCivs);
  if (!a || !b) throw new Error('Expected minor civs');
  for (const id of [a, b]) {
    state.minorCivs[id].regionalGrievanceByCiv = {
      player: { aggressorCivId: 'player', pressure: 95, posture: 'mobilizing', lastAggressionTurn: state.turn, lastPostureChangeTurn: state.turn, causes: [], mobilizationProgress: 0 },
    };
  }

  const result = processMinorCivCoalitions(state, new EventBus());

  expect(result.minorCivCoalitions).toEqual({});
  expect(result.minorCivs[a].regionalGrievanceByCiv.player.posture).toBe('mobilizing');
});

it('requires both grievance and regional maturity before coalition talks', () => {
  const immature = createNewGame(undefined, 'mc-immature-no-talks', 'medium');
  immature.era = 2;
  const [a, b] = Object.keys(immature.minorCivs);
  if (!a || !b) throw new Error('Expected minor civs');
  for (const id of [a, b]) {
    immature.cities[immature.minorCivs[id].cityId].population = 1;
    immature.minorCivs[id].units = [];
    immature.minorCivs[id].regionalGrievanceByCiv = {
      player: { aggressorCivId: 'player', pressure: 90, posture: 'mobilizing', lastAggressionTurn: immature.turn, lastPostureChangeTurn: immature.turn, causes: [], mobilizationProgress: 0 },
    };
  }

  const result = processMinorCivCoalitions(immature, new EventBus());

  expect(result.minorCivCoalitions).toEqual({});
});

it('starts talks in mature era 2 regions and declares war only after countdown', () => {
  let state = createNewGame(undefined, 'mc-era2-talks-war', 'medium');
  state.era = 2;
  state.opponentChallenge = 'standard';
  const [a, b] = Object.keys(state.minorCivs);
  if (!a || !b) throw new Error('Expected minor civs');
  for (const id of [a, b]) {
    state.cities[state.minorCivs[id].cityId].population = 3;
    state.minorCivs[id].regionalGrievanceByCiv = {
      player: { aggressorCivId: 'player', pressure: 90, posture: 'mobilizing', lastAggressionTurn: state.turn, lastPostureChangeTurn: state.turn, causes: [], mobilizationProgress: 0 },
    };
  }
  const bus = new EventBus();
  const wars: unknown[] = [];
  bus.on('minor-civ:coalition-war-declared', event => wars.push(event));

  state = processMinorCivCoalitions(state, bus);
  expect(Object.values(state.minorCivCoalitions ?? {})[0]?.status).toBe('talks');
  expect(wars).toHaveLength(0);

  state.turn += 4;
  state = processMinorCivCoalitions(state, bus);

  expect(Object.values(state.minorCivCoalitions ?? {})[0]?.status).toBe('war');
  expect(state.civilizations.player.diplomacy.atWarWith).toEqual(expect.arrayContaining([a, b]));
  expect(wars).toHaveLength(1);
});

it('mobilizes trained defenders over time and conscripts only with population cost and occupancy checks', () => {
  let state = createNewGame(undefined, 'mc-mobilization-conscription', 'small');
  state.era = 2;
  const minorCivId = Object.keys(state.minorCivs)[0]!;
  const city = state.cities[state.minorCivs[minorCivId].cityId];
  city.population = 4;
  state.minorCivs[minorCivId].regionalGrievanceByCiv = {
    player: { aggressorCivId: 'player', pressure: 85, posture: 'mobilizing', lastAggressionTurn: state.turn, lastPostureChangeTurn: state.turn, causes: [], mobilizationProgress: 23 },
  };

  state = processMinorCivCoalitions(state, new EventBus());

  const current = state.minorCivs[minorCivId];
  expect(state.cities[current.cityId].population).toBe(3);
  expect(current.regionalGrievanceByCiv.player.conscriptCooldownUntil).toBeGreaterThan(state.turn);
  const spawned = current.units.map(id => state.units[id]).filter(Boolean);
  expect(spawned.some(unit => unit.health === 65)).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-coalition-system.test.ts`

Expected: FAIL because `processMinorCivCoalitions` does not exist.

- [ ] **Step 3: Implement processor**

Implement in `src/systems/minor-civ-coalition-system.ts`:

- `getChallengeTuning(state)` returning decay, mobilization progress, talks countdown.
- `getEraDefenderType(state)` returning `warrior`, `swordsman`, `pikeman`, or `musketeer`.
- `findFreeAdjacentSpawn(state, position)` checking map tile existence and unit occupancy.
- `hasRegionalMaturity(state, memberIds, targetCivId)` requiring total population >= 6 or two living combat units.
- `buildRegionKey(memberIds, targetCivId)` sorted deterministic key.
- `processMinorCivCoalitions(state, bus)`:
  - normalize state first
  - decay pressure for non-war grievances
  - update posture with Era 1 formal-talk suppression
  - accumulate mobilization progress for `mobilizing`/`coalition-talks`
  - spawn trained defender at threshold when legal
  - conscript at high pressure when legal, spending population and creating 65-health defender
  - group eligible Era 2+ grievances by target
  - start talks if 2+ mature members and cooldowns allow
  - declare war after countdown using a local bilateral helper inside `minor-civ-coalition-system.ts` that imports `declareWar` directly. Do not import `minor-civ-actions.ts` from the coalition system because `minor-civ-actions.ts` imports reparations helpers from the coalition system.
  - emit transition events exactly when state changes

Use immutable copies for `minorCivs`, `cities`, `units`, `civilizations`, `minorCivCoalitions`, and `minorCivRegionalCooldowns`. Do not mutate the input state.

In `processMinorCivTurn`, call `processMinorCivCoalitions(nextState, bus)` once before iterating individual minor civs.

The local bilateral war helper must mirror `setMinorCivWarState` behavior for coalition war:

```ts
function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...remaining } = record;
  return remaining;
}

function setCoalitionMinorCivWarState(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
): { state: GameState; changed: boolean } {
  const major = state.civilizations[majorCivId];
  const minor = state.minorCivs[minorCivId];
  if (!major || !minor || minor.isDestroyed) return { state, changed: false };
  const majorAtWar = major.diplomacy.atWarWith.includes(minorCivId);
  const minorAtWar = minor.diplomacy.atWarWith.includes(majorCivId);
  if (majorAtWar && minorAtWar) return { state, changed: false };
  const status = minor.chainStatusByCiv[majorCivId];
  const nextChainStatusByCiv = status?.status === 'allied'
    ? {
        ...minor.chainStatusByCiv,
        [majorCivId]: {
          chainId: status.chainId,
          status: 'broken' as const,
          statusTurn: state.turn,
          earnedTurn: status.earnedTurn,
        },
      }
    : status?.status === 'pending'
      ? omitRecordKey(minor.chainStatusByCiv, majorCivId)
      : minor.chainStatusByCiv;

  return {
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [majorCivId]: {
          ...major,
          diplomacy: majorAtWar ? major.diplomacy : declareWar(major.diplomacy, minorCivId, state.turn, false),
        },
      },
      minorCivs: {
        ...state.minorCivs,
        [minorCivId]: {
          ...minor,
          activeQuests: omitRecordKey(minor.activeQuests, majorCivId),
          diplomacy: minorAtWar ? minor.diplomacy : declareWar(minor.diplomacy, majorCivId, state.turn, false),
          chainStatusByCiv: nextChainStatusByCiv,
          questCooldownUntilByCiv: { ...minor.questCooldownUntilByCiv, [majorCivId]: state.turn + 3 },
        },
      },
    },
    changed: true,
  };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-coalition-system.test.ts tests/systems/minor-civ-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-system.ts tests/systems/minor-civ-coalition-system.test.ts
git commit -m "feat(minor-civs): process coalition mobilization"
```

## Task 4: Reparations And Recovery Actions

**Files:**
- Modify: `src/systems/minor-civ-coalition-system.ts`
- Modify: `src/systems/minor-civ-actions.ts`
- Test: `tests/systems/minor-civ-actions.test.ts`

- [ ] **Step 1: Write failing reparations tests**

Add tests:

```ts
it('quotes and pays reparations only for active grievance', () => {
  const { state, minorCivId, minorCiv } = actionState('minor-action-reparations');
  minorCiv.regionalGrievanceByCiv = {
    player: { aggressorCivId: 'player', pressure: 60, posture: 'mobilizing', lastAggressionTurn: state.turn, lastPostureChangeTurn: state.turn, causes: [], mobilizationProgress: 0 },
  };

  const quote = getMinorCivReparationsQuote(state, 'player', minorCivId);
  const result = performMinorCivReparations(state, 'player', minorCivId);

  expect(quote.available).toBe(true);
  expect(quote.cost).toBe(50);
  expect(result.ok).toBe(true);
  expect(result.state.civilizations.player.gold).toBe(150);
  expect(result.state.minorCivs[minorCivId].regionalGrievanceByCiv.player.pressure).toBe(40);
  expect(result.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(8);
});

it('blocks reparations while at war or when stale repeat-click tries to pay again', () => {
  const { state, minorCivId, minorCiv } = actionState('minor-action-reparations-block');
  minorCiv.regionalGrievanceByCiv = {
    player: { aggressorCivId: 'player', pressure: 10, posture: 'none', lastAggressionTurn: state.turn, lastPostureChangeTurn: state.turn, causes: [], mobilizationProgress: 0 },
  };

  const first = performMinorCivReparations(state, 'player', minorCivId);

  expect(first.ok).toBe(false);
  expect(first.state.civilizations.player.gold).toBe(200);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-actions.test.ts`

Expected: FAIL because reparations functions do not exist.

- [ ] **Step 3: Implement reparations**

In `minor-civ-coalition-system.ts`, add:

```ts
export interface ReparationsQuote {
  available: boolean;
  cost: number;
  reason: string | null;
  pressureReduction: number;
}

export function getMinorCivReparationsQuote(state: GameState, majorCivId: string, minorCivId: string): ReparationsQuote {
  const cost = MINOR_CIV_REPARATIONS_BASE_COST + (state.era ?? 1) * 10;
  const major = state.civilizations[majorCivId];
  const minor = state.minorCivs[minorCivId];
  const grievance = minor?.regionalGrievanceByCiv?.[majorCivId];
  if (!major || !minor || minor.isDestroyed) return { available: false, cost, reason: 'Diplomatic party not found.', pressureReduction: 20 };
  if (isMinorCivAtWar(state, majorCivId, minorCivId)) return { available: false, cost, reason: 'Reparations are unavailable while at war.', pressureReduction: 20 };
  if (!grievance || grievance.pressure < 20) return { available: false, cost, reason: 'No active regional grievance.', pressureReduction: 20 };
  if (major.gold < cost) return { available: false, cost, reason: `Requires ${cost} gold.`, pressureReduction: 20 };
  return { available: true, cost, reason: null, pressureReduction: 20 };
}
```

In `minor-civ-actions.ts`, export `getMinorCivReparationsQuote` passthrough and `performMinorCivReparations` that:

- validates quote
- clones state
- deducts gold
- reduces pressure by 20
- adds relationship +8 via `modifyRelationship`
- updates posture through `evaluateCoalitionPosture`
- records a `reparations` cause
- returns `MinorCivActionResult`

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-actions.test.ts tests/systems/minor-civ-coalition-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-actions.ts tests/systems/minor-civ-actions.test.ts
git commit -m "feat(minor-civs): add reparations recovery"
```

## Task 5: Presentation, Diplomacy Panel, And Interaction Replay

**Files:**
- Modify: `src/systems/minor-civ-presentation.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Test: `tests/ui/diplomacy-panel.test.ts`

- [ ] **Step 1: Write failing UI tests**

Add tests:

```ts
it('shows readable coalition posture without exact pressure and keeps existing actions reachable', () => {
  const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeBreakaway: true });
  const mcId = Object.keys(state.minorCivs)[0]!;
  const city = state.cities[state.minorCivs[mcId].cityId];
  state.civilizations.player.visibility.tiles[`${city.position.q},${city.position.r}`] = 'fog';
  state.minorCivs[mcId].regionalGrievanceByCiv = {
    player: {
      aggressorCivId: 'player',
      pressure: 62,
      posture: 'mobilizing',
      lastAggressionTurn: state.turn,
      lastPostureChangeTurn: state.turn,
      causes: [{ type: 'minor-civ-conquered', turn: state.turn, sourceMinorCivId: mcId, pressureDelta: 35, relationshipDelta: -15 }],
      mobilizationProgress: 0,
    },
  };

  const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

  expect(panel.textContent).toContain('Mobilizing');
  expect(panel.textContent).toContain('fear further conquest');
  expect(panel.textContent).not.toContain('62');
  expect(panel.textContent).toContain('Gift');
  expect(panel.textContent).toContain('Declare War');
});

it('renders reparations cost, disabled reason, and prevents stale repeat charging through rerender callback', () => {
  const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeBreakaway: true, gold: 200 });
  const mcId = Object.keys(state.minorCivs)[0]!;
  const city = state.cities[state.minorCivs[mcId].cityId];
  state.civilizations.player.visibility.tiles[`${city.position.q},${city.position.r}`] = 'fog';
  state.minorCivs[mcId].regionalGrievanceByCiv = {
    player: { aggressorCivId: 'player', pressure: 60, posture: 'mobilizing', lastAggressionTurn: state.turn, lastPostureChangeTurn: state.turn, causes: [], mobilizationProgress: 0 },
  };
  let calls = 0;
  const panel = createDiplomacyPanel(container, state, {
    onAction: () => {},
    onClose: () => {},
    onPayReparations: () => { calls += 1; },
  });

  const reparations = panel.querySelector('[data-action="pay-reparations"]') as HTMLButtonElement;
  expect(reparations.textContent).toContain('50 Gold');
  reparations.click();
  reparations.click();

  expect(calls).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts`

Expected: FAIL because presentation/reparations UI does not exist.

- [ ] **Step 3: Implement presentation and UI**

In `minor-civ-presentation.ts`, add:

```ts
export interface MinorCivCoalitionPresentation {
  postureLabel: string | null;
  causeText: string | null;
  recoveryText: string | null;
  reparations: ReparationsQuote;
}

const POSTURE_LABELS: Record<MinorCivCoalitionPosture, string | null> = {
  none: null,
  wary: 'Wary',
  mobilizing: 'Mobilizing',
  'coalition-talks': 'Coalition Talks',
  'at-war': 'At War',
  'cooling-down': 'Cooling Down',
};

export function getMinorCivCoalitionPresentationForPlayer(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): MinorCivCoalitionPresentation {
  const presentation = getMinorCivPresentationForPlayer(state, viewerCivId, minorCivId, 'City-State');
  const empty = {
    postureLabel: null,
    causeText: null,
    recoveryText: null,
    reparations: getMinorCivReparationsQuote(state, viewerCivId, minorCivId),
  };
  if (!presentation.known) return empty;
  const grievance = state.minorCivs[minorCivId]?.regionalGrievanceByCiv?.[viewerCivId];
  if (!grievance || grievance.posture === 'none') return empty;
  const sourceId = grievance.causes.find(cause => cause.sourceMinorCivId)?.sourceMinorCivId;
  const source = sourceId ? getMinorCivPresentationForPlayer(state, viewerCivId, sourceId, 'a nearby city-state') : null;
  const sourceName = source?.known ? source.name : 'a nearby city-state';
  return {
    postureLabel: POSTURE_LABELS[grievance.posture],
    causeText: grievance.posture === 'cooling-down'
      ? `Tensions from ${sourceName} are easing.`
      : `They fear further conquest after your actions near ${sourceName}.`,
    recoveryText: 'Reparations can calm the crisis. Helpful deeds and time heal trust more deeply.',
    reparations: getMinorCivReparationsQuote(state, viewerCivId, minorCivId),
  };
}
```

Rules:

- If undiscovered, return all text null and unavailable reparations.
- `wary`: "Wary"
- `mobilizing`: "Mobilizing"
- `coalition-talks`: "Coalition Talks"
- `at-war`: "At War"
- `cooling-down`: "Cooling Down"
- Cause text masks unknown source as "a nearby city-state".
- Recovery text explains reparations/deeds/time.

In `DiplomacyPanelCallbacks`, add `onPayReparations?: (mcId: string) => void;`.

In `MinorCivRowData`, add `coalitionPresentation`.

Render:

- posture/cause/recovery text under quest text using `data-text` slots.
- reparations button in the existing action row using `createGameButton`.
- disabled reason as small text when unavailable due to gold/war/no grievance.
- one-shot stale click guard:

```ts
let reparationsClicked = false;
button.addEventListener('click', () => {
  if (reparationsClicked) return;
  reparationsClicked = true;
  callbacks.onPayReparations?.(row.mcId);
  panel.remove();
});
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/systems/minor-civ-presentation.ts src/ui/diplomacy-panel.ts tests/ui/diplomacy-panel.test.ts
git commit -m "feat(ui): surface minor civ coalition pressure"
```

## Task 6: Notifications And Advisor

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/ui/minor-civ-notifications.ts`
- Modify: `src/ui/minor-civ-notification-listeners.ts`
- Modify: `src/ui/advisor-system.ts`
- Test: `tests/ui/minor-civ-notifications.test.ts`
- Test: `tests/ui/minor-civ-notification-listeners.test.ts`
- Test: `tests/ui/advisor-system.test.ts`

- [ ] **Step 1: Write failing notification/advisor tests**

Add tests that assert:

```ts
it('routes coalition posture notifications only to the target civ with viewer-safe text', () => {
  const state = createNewGame(undefined, 'mc-coalition-notification', 'small');
  const minorCivId = getFirstMinorCivId(state);
  discoverMinorCiv(state, 'player', minorCivId);
  const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player')!;

  expect(getMinorCivNotification(state, 'player', {
    type: 'minor-civ:coalition-posture-changed',
    majorCivId: 'player',
    minorCivId,
    newPosture: 'mobilizing',
  })?.message).toContain('mobilizing');
  expect(getMinorCivNotification(state, otherMajorId, {
    type: 'minor-civ:coalition-posture-changed',
    majorCivId: 'player',
    minorCivId,
    newPosture: 'mobilizing',
  })).toBeNull();
});
```

In listener tests, emit `minor-civ:coalition-posture-changed` with authoritative `state` and assert pending event only on target player.

In advisor tests, create player grievance with posture `coalition-talks`, pump advisor, and expect a chancellor message containing "coalition".

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/ui/advisor-system.test.ts`

Expected: FAIL because event types and advisor trigger do not exist.

- [ ] **Step 3: Implement events, notifications, and advisor**

Add `GameEvents` entries:

- `minor-civ:regional-grievance-recorded`
- `minor-civ:coalition-posture-changed`
- `minor-civ:coalition-talks-started`
- `minor-civ:coalition-war-declared`
- `minor-civ:coalition-cooling-down`
- `minor-civ:reparations-accepted`
- `minor-civ:emergency-conscription`

Extend `MinorCivNotificationEvent` and `getMinorCivNotification`:

- target-scoped events use `majorCivId`.
- use `getMinorCivPresentationForPlayer`.
- unknown minor civ messages are generic.
- posture labels are readable.

Extend listeners with `routeOwnedEvent` for all target-scoped coalition events, using authoritative `data.state`.

Add advisor trigger near chancellor diplomacy warnings:

- current player only
- any discovered minor civ has grievance toward current player with posture `mobilizing` or `coalition-talks`
- message is actionable and includes "reparations" or "helping city-states"

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/ui/advisor-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/core/types.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts src/ui/advisor-system.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/ui/advisor-system.test.ts
git commit -m "feat(minor-civs): notify coalition escalation"
```

## Task 7: Live Wiring In Main Callbacks

**Files:**
- Modify: `src/main.ts`
- Test: smallest relevant existing UI/system tests, plus manual code inspection

- [ ] **Step 1: Locate diplomacy callbacks**

Run: `rg -n "onGiftGold|onSponsorFestival|createDiplomacyPanel|performMinorCivGift|performMinorCivFestival" src/main.ts`

Expected: shows the live callback wiring.

- [ ] **Step 2: Wire reparations callback**

In `src/main.ts`, import `performMinorCivReparations` and wire `onPayReparations`.

The callback must:

- call `performMinorCivReparations(gameState, gameState.currentPlayer, mcId)`
- if `ok`, set `gameState = result.state`
- emit `minor-civ:reparations-accepted` with authoritative state
- show warning/info on failure through existing notification path
- reopen or rerender the diplomacy panel from fresh state if that is the existing pattern for gift/festival callbacks

- [ ] **Step 3: Run focused checks**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts tests/systems/minor-civ-actions.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/main.ts
git commit -m "feat(minor-civs): wire reparations action"
```

## Task 8: Final Verification, Rule Checks, And Inline Review

**Files:**
- All changed files

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-system.ts src/systems/minor-civ-actions.ts src/systems/minor-civ-presentation.ts src/ui/diplomacy-panel.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts src/ui/advisor-system.ts src/main.ts src/storage/save-manager.ts
```

Expected: exit 0.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-coalition-system.test.ts tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-actions.test.ts tests/storage/save-persistence.test.ts tests/ui/diplomacy-panel.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/ui/advisor-system.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `./scripts/run-with-mise.sh yarn build`

Expected: PASS.

- [ ] **Step 4: Inline code review checklist**

Review diffs manually:

- `git diff --stat origin/main...HEAD`
- `git diff origin/main...HEAD -- src/core/types.ts src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-system.ts src/systems/minor-civ-actions.ts src/systems/minor-civ-presentation.ts src/ui/diplomacy-panel.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts src/ui/advisor-system.ts src/main.ts src/storage/save-manager.ts`

Fix any issue found in:

- testing and regressions
- logic and actor-complete mutation paths
- UI/UX and visible refresh
- architecture and data shape
- save/load solo and hot-seat behavior
- gameplay balance and fun
- privacy and discovery
- no free/magical units
- no Era 1 coalition war
- no stale repeat-click charges

- [ ] **Step 5: Run final full checks before MR**

Run:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

Expected: both PASS.

- [ ] **Step 6: Fetch, rebase, push, and create MR**

Run:

```bash
git fetch origin main
git rebase origin/main
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
git push -u origin codex/issue-355-regional-grievance-design
gh pr create --repo a1flecke/conquestoria --draft --title "feat(minor-civs): add regional grievance coalitions" --body "## Summary\n- adds local city-state grievance after conquest\n- adds mobilization, reparations, coalition talks, and coalition war rules\n- preserves solo/hot-seat save compatibility and viewer-safe notifications\n\n## Tests\n- ./scripts/run-with-mise.sh yarn build\n- ./scripts/run-with-mise.sh yarn test"
```

Expected: branch pushed and draft MR created.
