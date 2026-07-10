# Crisis Events & Revolutionary Movements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement mid-game crisis events (#381) and revolutionary movements (#354) per `docs/superpowers/specs/2026-07-09-crisis-events-and-revolutions-design.md`, as 5 shippable MRs.

**Architecture:** A definition-driven `CRISIS_FLAVORS` table feeds a per-human scheduler inside the existing threat-pressure loop. Three archetypes (Outbreak/Catastrophe/Hunt) resolve in a new `crisis-system.ts`; the Uprising archetype extends the existing `faction-system.ts` (contagion + concession). Per-player challenge rides a new optional `Civilization.challenge` field.

**Tech Stack:** TypeScript, Vitest, Canvas 2D + DOM (no new libraries).

**Executor notes (read first):**
- Run all commands via `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)"`.
- Targeted tests: `bash scripts/run-with-mise.sh yarn vitest run <path>`. Full suite: `bash scripts/run-with-mise.sh yarn test`. Type-check happens only in `yarn build`.
- Before ANY `git push` / `gh pr create`: run `yarn build` AND `yarn test`, both must exit 0.
- Every Write/Edit under `src/` triggers a rules hook — read its feedback and fix violations in the same turn.
- NEVER `Math.random()`. NEVER hardcode `'player'` — use `state.currentPlayer` / explicit civ ids. All state is plain serializable objects; turn processing is immutable (spread, never mutate).
- Line numbers in this plan were captured at plan time — re-grep if drifted.

## Global Constraints (from spec — apply to every task)

- Grace periods: era 1 crisis-free for everyone; explorer = eras 1–2 AND turn ≥ 30; standard = era 1 AND turn ≥ 20; veteran = era 1 AND turn ≥ 10. Both era and turn floors must pass.
- Cooldowns (min turns between onsets per player): explorer 12, standard 8, veteran 5.
- Severity multipliers: explorer 0.5×, standard 1.0×, veteran 1.3×.
- Cap: reuse `maxIndependentCrisesPerHuman` (explorer 1, standard 2, veteran 3). Cap gates the scheduler only; organic uprisings count toward it (one per connected unrest group) and may exceed it.
- `CRISIS_PRESSURE_FLOOR = 2.0`; external-threat recency gate = 5 turns.
- Outbreak spread: same-owner cities only. Catastrophe blast: clipped to target player's own territory. Crises target humans only.
- `civ.challenge` affects internal-pressure knobs ONLY; AI behavior keeps using game-wide `state.opponentChallenge`.
- All crisis announcements route through per-player notification queues; crisis map markers respect fog of war.
- Old saves (no crisis fields) must load unchanged; unknown `flavorId` in a save drops that crisis with a `console.warn`.
- Description honesty: every player-visible string must describe only implemented mechanics.

## File Structure

| File | Role |
|---|---|
| `src/systems/seeded-lcg.ts` | **Create** (MR1): shared seeded LCG (extracted from threat-pressure-system) |
| `src/systems/crisis-flavor-definitions.ts` | **Create** (MR1): `CrisisFlavor` interface, `CRISIS_FLAVORS` table, geography predicates, era-name helper |
| `src/systems/crisis-system.ts` | **Create** (MR1): scheduler, outbreak resolver, response actions, yield multiplier, catastrophe (MR2) + hunt orchestration (MR3) |
| `src/core/opponent-challenge.ts` | Modify (MR1): new profile fields, `resolveChallengeForCiv`, `getChallengeProfileForCiv` |
| `src/core/types.ts` | Modify (MR1+): optional fields + events |
| `src/systems/threat-pressure-system.ts` | Modify (MR1): per-civ challenge in `canStartIndependentThreat`; scheduler call |
| `src/core/turn-manager.ts` | Modify (MR1): `processCrisisTurn` in pipeline; crisis yield multiplier; per-civ pending challenge apply |
| `src/storage/save-manager.ts` | Modify (MR1): sanitize unknown flavor ids on load |
| `src/ui/hotseat-setup.ts`, `src/ui/pause-menu-panel.ts` | Modify (MR1): per-player challenge picker / own-challenge editing |
| `src/ui/city-panel.ts` | Modify (MR1, MR4): crisis chip + response buttons; concession button |
| `src/ui/notification-routing.ts`, `src/ui/advisor-system.ts`, `src/main.ts` | Modify (MR1+): crisis routing, advisor lines, event wiring |
| `src/audio/music-director.ts` | Modify (MR1): crisis-active snapshot hold |
| `src/systems/improvement-system.ts` | Modify (MR2): `restore_land` worker action |
| `src/systems/city-work-system.ts` | Modify (MR2): devastated tiles yield zero; resilience bonus |
| `src/renderer/` (hex renderer + city markers) | Modify (MR2): devastated tint, crisis icon (fog-aware) |
| `src/systems/faction-system.ts` | Modify (MR3 feast, MR4 contagion + concession) |
| Tests | `tests/systems/crisis-*.test.ts`, `tests/systems/helpers/crisis-fixture.ts`, `tests/ui/city-panel-crisis.test.ts`, extensions to faction/save tests |

---

# MR1 — Framework, per-player challenge, Plague outbreak, SFX hooks

Branch: `feat/crisis-mr1-framework`. Deliverable: plague crises fire for humans past grace, per-player challenge works in hotseat/solo, city panel offers Quarantine/Remedy, old saves load.

### Task 1.1: Shared seeded LCG module

**Files:**
- Create: `src/systems/seeded-lcg.ts`
- Modify: `src/systems/threat-pressure-system.ts` (delete private `lcg`, import shared)
- Test: `tests/systems/seeded-lcg.test.ts`

**Interfaces:**
- Produces: `seededLcg(seed: number): () => number` (returns values in [0,1)); `weightedPick<T>(items: T[], weights: number[], rng: () => number): T`

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/seeded-lcg.test.ts
import { describe, it, expect } from 'vitest';
import { seededLcg, weightedPick } from '@/systems/seeded-lcg';

describe('seededLcg', () => {
  it('is deterministic for the same seed', () => {
    const a = seededLcg(42); const b = seededLcg(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('returns values in [0, 1)', () => {
    const rng = seededLcg(7);
    for (let i = 0; i < 100; i++) { const v = rng(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('weightedPick', () => {
  it('always picks the only positively weighted item', () => {
    const rng = seededLcg(1);
    for (let i = 0; i < 20; i++) expect(weightedPick(['a', 'b'], [0, 1], rng)).toBe('b');
  });
  it('is deterministic', () => {
    expect(weightedPick(['a', 'b', 'c'], [1, 1, 1], seededLcg(5)))
      .toBe(weightedPick(['a', 'b', 'c'], [1, 1, 1], seededLcg(5)));
  });
});
```

- [ ] **Step 2: Run it** — `bash scripts/run-with-mise.sh yarn vitest run tests/systems/seeded-lcg.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/systems/seeded-lcg.ts
// Shared seeded LCG — no Math.random() per project rules.
export function seededLcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

export function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
```

- [ ] **Step 4: Refactor threat-pressure-system** — delete its private `lcg` function (around line 375) and `import { seededLcg } from './seeded-lcg';`, replacing every `lcg(` call with `seededLcg(`. Note: `(s >>> 0) / 0xffffffff` can return exactly 1.0 only when s === 0xffffffff (one value in 2^32); keep behavior identical to the original — do NOT change the divisor.

- [ ] **Step 5: Run** `bash scripts/run-with-mise.sh yarn vitest run tests/systems/seeded-lcg.test.ts tests/systems/threat-pressure-system.test.ts` — expect PASS.

- [ ] **Step 6: Commit** — `git commit -m "refactor(systems): extract shared seeded LCG"`

### Task 1.2: Challenge profile fields + per-civ resolution

**Files:**
- Modify: `src/core/opponent-challenge.ts`, `src/core/types.ts` (Civilization: `challenge?`, `pendingChallenge?`), `src/systems/threat-pressure-system.ts:206` (`canStartIndependentThreat`)
- Test: `tests/core/opponent-challenge.test.ts` (extend existing if present, else create)

**Interfaces:**
- Produces: `OpponentChallengeProfile` gains `crisisCooldownTurns: number; crisisGraceMaxEra: number; crisisGraceMinTurns: number; crisisSeverityMultiplier: number`. New: `resolveChallengeForCiv(state: GameState, civId: string): OpponentChallenge`; `getChallengeProfileForCiv(state: GameState, civId: string): OpponentChallengeProfile`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  OPPONENT_CHALLENGE_PROFILES, resolveChallengeForCiv, getChallengeProfileForCiv,
} from '@/core/opponent-challenge';
import type { GameState } from '@/core/types';

function stateWith(civChallenge: string | undefined, gameChallenge: string | undefined): GameState {
  return {
    opponentChallenge: gameChallenge,
    civilizations: { c1: { id: 'c1', isHuman: true, challenge: civChallenge } },
  } as unknown as GameState;
}

describe('per-civ challenge resolution', () => {
  it('prefers civ.challenge over game-wide', () => {
    expect(resolveChallengeForCiv(stateWith('explorer', 'veteran'), 'c1')).toBe('explorer');
  });
  it('falls back to game-wide, then standard', () => {
    expect(resolveChallengeForCiv(stateWith(undefined, 'veteran'), 'c1')).toBe('veteran');
    expect(resolveChallengeForCiv(stateWith(undefined, undefined), 'c1')).toBe('standard');
  });
  it('ignores invalid values', () => {
    expect(resolveChallengeForCiv(stateWith('bogus', undefined), 'c1')).toBe('standard');
  });
});

describe('crisis profile knobs', () => {
  it('carries spec values', () => {
    expect(OPPONENT_CHALLENGE_PROFILES.explorer).toMatchObject({
      crisisCooldownTurns: 12, crisisGraceMaxEra: 2, crisisGraceMinTurns: 30, crisisSeverityMultiplier: 0.5 });
    expect(OPPONENT_CHALLENGE_PROFILES.standard).toMatchObject({
      crisisCooldownTurns: 8, crisisGraceMaxEra: 1, crisisGraceMinTurns: 20, crisisSeverityMultiplier: 1.0 });
    expect(OPPONENT_CHALLENGE_PROFILES.veteran).toMatchObject({
      crisisCooldownTurns: 5, crisisGraceMaxEra: 1, crisisGraceMinTurns: 10, crisisSeverityMultiplier: 1.3 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (fields/functions missing).

- [ ] **Step 3: Implement.** Add the four fields to `OpponentChallengeProfile` and all three profile literals with the values above. Add to `types.ts` `Civilization`: `challenge?: OpponentChallenge; pendingChallenge?: OpponentChallenge;` (comment: humans only; governs internal-pressure knobs only — AI behavior stays on game-wide setting). Then:

```ts
export function resolveChallengeForCiv(state: GameState, civId: string): OpponentChallenge {
  const civ = state.civilizations[civId];
  if (civ?.isHuman && isOpponentChallenge(civ.challenge)) return civ.challenge;
  return resolveOpponentChallenge(state);
}

export function getChallengeProfileForCiv(state: GameState, civId: string): OpponentChallengeProfile {
  return OPPONENT_CHALLENGE_PROFILES[resolveChallengeForCiv(state, civId)];
}
```

In `canStartIndependentThreat` (threat-pressure-system.ts:206) replace
`OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)]` with
`getChallengeProfileForCiv(state, humanId)` (import it) — the crisis cap becomes per-player. Also update `processIndependentThreatPressureForHumans` (line ~258): its `profile.recoveryRounds` use must switch to the per-human profile inside the loop.

- [ ] **Step 4: Run test + full threat-pressure tests — expect PASS.**
- [ ] **Step 5: Commit** — `feat(core): per-civ opponent challenge + crisis profile knobs`

### Task 1.3: Crisis types + events + flavor table with Plague

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/crisis-flavor-definitions.ts`
- Test: `tests/systems/crisis-flavor-definitions.test.ts`

**Interfaces (produced — later tasks depend on these exact names):**

```ts
// types.ts
export type CrisisArchetype = 'outbreak' | 'catastrophe' | 'hunt';
export type CrisisStage = 'active' | 'contained' | 'recovery' | 'menacing' | 'assaulting';
export type CrisisOutcome = 'contained' | 'expired' | 'hunted' | 'recovered' | 'abandoned';
export interface ActiveCrisis {
  id: string; flavorId: string; archetype: CrisisArchetype; targetCivId: string;
  cityIds: string[]; tileKeys: string[]; startedTurn: number;
  stage: CrisisStage; turnsInStage: number;
  quarantinedCityIds?: string[];
  remedyCompletionByCity?: Record<string, number>; // cityId -> turn remedy completes
  huntEntityId?: string;
}
// GameState: activeCrises?: Record<string, ActiveCrisis>;
// Civilization: recentCrisisHistory?: string[]; lastCrisisOnsetTurn?: number;
// TileState: devastatedUntilTurn?: number;
// City: concessionImmunityUntilTurn?: number; resilienceBonusUntilTurn?: number;
// GameEvents additions:
'crisis:started':   { crisisId: string; flavorId: string; civId: string; cityIds: string[] };
'crisis:spread':    { crisisId: string; fromCityId: string; toCityId: string };
'crisis:escalated': { crisisId: string; stage: CrisisStage };
'crisis:response':  { crisisId: string; civId: string; action: string };
'crisis:resolved':  { crisisId: string; civId: string; outcome: CrisisOutcome };

// crisis-flavor-definitions.ts
export interface CrisisSeverity {
  yieldPenalty: number;                    // 0.25 = city yields ×0.75 while afflicted
  popLossEveryNTurnsIgnored: number | null;
  autoExpireTurns: number | null;
}
export interface CrisisFlavor {
  id: string; archetype: CrisisArchetype; eraBand: [number, number];
  geographyPredicate: (state: GameState, city: City) => boolean;
  spreadBoostPredicate?: (state: GameState, city: City) => boolean;
  severityByChallenge: Record<OpponentChallenge, CrisisSeverity>;
  displayNamesByEra: Record<number, string>;    // sparse — nearest era at or below is used
  advisorLine: string;                          // '{name} has reached {city}! <what to do>'
  responseActions: Array<'quarantine' | 'remedy'>;
}
export const CRISIS_FLAVORS: CrisisFlavor[];
export function getCrisisFlavor(id: string): CrisisFlavor | undefined;
export function getCrisisDisplayName(flavor: CrisisFlavor, era: number): string; // nearest key <= era, else lowest key
```

- [ ] **Step 1: Write the failing generic-table test** (the wonder-content pattern — every future row is auto-checked):

```ts
import { describe, it, expect } from 'vitest';
import { CRISIS_FLAVORS, getCrisisDisplayName, getCrisisFlavor } from '@/systems/crisis-flavor-definitions';

describe('CRISIS_FLAVORS table invariants', () => {
  it('has at least the plague flavor', () => {
    expect(getCrisisFlavor('plague')).toBeDefined();
  });
  for (const flavor of CRISIS_FLAVORS) {
    describe(flavor.id, () => {
      it('has a valid era band within 1..12, ordered', () => {
        expect(flavor.eraBand[0]).toBeGreaterThanOrEqual(1);
        expect(flavor.eraBand[1]).toBeLessThanOrEqual(12);
        expect(flavor.eraBand[0]).toBeLessThanOrEqual(flavor.eraBand[1]);
      });
      it('has severity entries for all three challenge levels', () => {
        for (const level of ['explorer', 'standard', 'veteran'] as const) {
          const s = flavor.severityByChallenge[level];
          expect(s).toBeDefined();
          expect(s.yieldPenalty).toBeGreaterThanOrEqual(0);
          expect(s.yieldPenalty).toBeLessThanOrEqual(0.5); // balance ceiling
        }
      });
      it('explorer severity always auto-expires and never costs population', () => {
        expect(flavor.severityByChallenge.explorer.autoExpireTurns).not.toBeNull();
        expect(flavor.severityByChallenge.explorer.popLossEveryNTurnsIgnored).toBeNull();
      });
      it('resolves a display name for every era in its band', () => {
        for (let era = flavor.eraBand[0]; era <= flavor.eraBand[1]; era++) {
          expect(getCrisisDisplayName(flavor, era)).toBeTruthy();
        }
      });
      it('advisor line says what to do (mentions an action or unit)', () => {
        expect(flavor.advisorLine.length).toBeGreaterThan(20);
      });
    });
  }
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement types + table.** Plague row:

```ts
import { hexNeighbors, hexKey } from './hex-utils';   // verify export names via grep before use

function nearTerrain(state: GameState, city: City, terrains: TerrainType[], radius: number): boolean {
  // BFS over hex ring; radius <= 2 keeps this cheap
  const seen = new Set<string>([hexKey(city.position)]);
  let frontier = [city.position];
  for (let step = 0; step < radius; step++) {
    const next: HexCoord[] = [];
    for (const coord of frontier) for (const nb of hexNeighbors(coord)) {
      const key = hexKey(nb);
      if (seen.has(key)) continue;
      seen.add(key); next.push(nb);
      const t = state.map.tiles[key];
      if (t && terrains.includes(t.terrain)) return true;
    }
    frontier = next;
  }
  return false;
}

export const CRISIS_FLAVORS: CrisisFlavor[] = [
  {
    id: 'plague',
    archetype: 'outbreak',
    eraBand: [2, 12],
    geographyPredicate: (state, city) =>
      city.population >= 4 || nearTerrain(state, city, ['swamp', 'jungle'], 2),
    spreadBoostPredicate: (state, city) => nearTerrain(state, city, ['swamp', 'jungle'], 2),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.15, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.25, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.35, popLossEveryNTurnsIgnored: 3,    autoExpireTurns: null },
    },
    displayNamesByEra: { 2: 'The Sweating Sickness', 4: 'The Great Pestilence', 6: 'Cholera Outbreak', 9: 'Influenza Pandemic' },
    advisorLine: '{name} has reached {city}! Quarantine the city to stop the spread, or fund a remedy effort to cure it.',
    responseActions: ['quarantine', 'remedy'],
  },
];
```

`getCrisisDisplayName`: pick the largest `displayNamesByEra` key ≤ era; if none, the smallest key.

- [ ] **Step 4: Run — PASS.** Also run `bash scripts/run-with-mise.sh yarn build` (type-check the new types).
- [ ] **Step 5: Commit** — `feat(systems): crisis types, events, flavor table with plague`

### Task 1.4: Test fixture + scheduler

**Files:**
- Create: `tests/systems/helpers/crisis-fixture.ts` (model on `tests/systems/helpers/breakaway-fixture.ts` — copy its state-shape, add knobs below)
- Create: `src/systems/crisis-system.ts`
- Test: `tests/systems/crisis-system.test.ts`

**Interfaces:**
- Consumes: `getChallengeProfileForCiv`, `computeThreatScore`, `deriveActiveIndependentThreatIds` (threat-pressure-system), `seededLcg`/`weightedPick`, `CRISIS_FLAVORS`.
- Produces:

```ts
export const CRISIS_PRESSURE_FLOOR = 2.0;
export const EXTERNAL_THREAT_RECENCY_TURNS = 5;
export const CONTAGION_GROUP_RANGE = 3;
export function countUnrestGroups(state: GameState, civId: string): number;
export function countActiveCrisesForCiv(state: GameState, civId: string): number;
export function processCrisisSchedulerForHumans(state: GameState, bus: EventBus): GameState;
```

- [ ] **Step 1: Fixture.** `makeCrisisFixture(options)` returns `{ state, civId }`: one human civ (`'p1'`, optional second `'p2'`), configurable `turn`, `era`, `challenge`, city list with positions/populations/`unrestLevel`, tiles with terrain, `opponentAI` ledger empty. Default: era 3, turn 40, two cities pop 5 and 3, grassland map with two swamp tiles adjacent to the capital, `lastCombatTurnByLandmass` unset (idle → high threat score). IMPORTANT: give every city tile a `regionKey` (e.g. `'landmass-1'`) — `computeThreatScore` requires it.

- [ ] **Step 2: Write failing scheduler tests**

```ts
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processCrisisSchedulerForHumans, countActiveCrisesForCiv, countUnrestGroups } from '@/systems/crisis-system';
import { makeCrisisFixture } from './helpers/crisis-fixture';

describe('crisis scheduler', () => {
  it('fires a plague for an idle human past grace', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'standard' });
    const next = processCrisisSchedulerForHumans(state, new EventBus());
    const crises = Object.values(next.activeCrises ?? {});
    expect(crises).toHaveLength(1);
    expect(crises[0].flavorId).toBe('plague');
    expect(next.civilizations.p1.lastCrisisOnsetTurn).toBe(40);
    expect(next.civilizations.p1.recentCrisisHistory).toEqual(['plague']);
  });
  it('respects era grace: no crisis in era 1 for anyone, era 2 for explorer', () => {
    for (const [challenge, era] of [['veteran', 1], ['explorer', 2]] as const) {
      const { state } = makeCrisisFixture({ era, turn: 99, challenge });
      expect(Object.keys(processCrisisSchedulerForHumans(state, new EventBus()).activeCrises ?? {})).toHaveLength(0);
    }
  });
  it('respects turn grace floors (30/20/10)', () => {
    for (const [challenge, turn] of [['explorer', 29], ['standard', 19], ['veteran', 9]] as const) {
      const { state } = makeCrisisFixture({ era: 5, turn, challenge });
      expect(Object.keys(processCrisisSchedulerForHumans(state, new EventBus()).activeCrises ?? {})).toHaveLength(0);
    }
  });
  it('respects cooldown', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'standard', lastCrisisOnsetTurn: 35 });
    expect(Object.keys(processCrisisSchedulerForHumans(state, new EventBus()).activeCrises ?? {})).toHaveLength(0);
  });
  it('is blocked at cap, counting unrest groups', () => {
    // standard cap = 2: one active crisis + one unrest group = at cap
    const { state } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'standard',
      existingCrisisCount: 1, unrestCityCount: 1 });
    expect(countUnrestGroups(state, 'p1')).toBe(1);
    expect(countActiveCrisesForCiv(state, 'p1')).toBe(2);
    const next = processCrisisSchedulerForHumans(state, new EventBus());
    expect(Object.keys(next.activeCrises ?? {})).toHaveLength(1); // unchanged
  });
  it('adjacent unrest cities count as ONE group', () => {
    const { state } = makeCrisisFixture({ unrestCityCount: 2, adjacentUnrestCities: true });
    expect(countUnrestGroups(state, 'p1')).toBe(1);
  });
  it('is deterministic: same state → same crisis id and target', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40 });
    const a = processCrisisSchedulerForHumans(state, new EventBus());
    const b = processCrisisSchedulerForHumans(state, new EventBus());
    expect(a.activeCrises).toEqual(b.activeCrises);
  });
  it('skips players with an active external threat', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40, activeExternalThreat: true });
    expect(Object.keys(processCrisisSchedulerForHumans(state, new EventBus()).activeCrises ?? {})).toHaveLength(0);
  });
  it('emits crisis:started with what-to-do copy routed later', () => {
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:started', e => events.push(e));
    processCrisisSchedulerForHumans(makeCrisisFixture({ era: 3, turn: 40 }).state, bus);
    expect(events).toHaveLength(1);
  });
});
```

(Check `EventBus` construction/`on` names against `src/core/event-bus.ts` and match the codebase's usage.)

- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement the scheduler**

```ts
// src/systems/crisis-system.ts
export function countUnrestGroups(state: GameState, civId: string): number {
  const cities = (state.civilizations[civId]?.cities ?? [])
    .map(id => state.cities[id])
    .filter((c): c is City => !!c && c.unrestLevel >= 1);
  const groups: City[][] = [];
  for (const city of cities) {
    const near = groups.filter(g =>
      g.some(m => hexDistance(m.position, city.position) <= CONTAGION_GROUP_RANGE));
    if (near.length === 0) { groups.push([city]); continue; }
    const merged = near.flat(); merged.push(city);
    for (const g of near) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  return groups.length;
}

export function countActiveCrisesForCiv(state: GameState, civId: string): number {
  const scheduled = Object.values(state.activeCrises ?? {}).filter(c => c.targetCivId === civId).length;
  return scheduled + countUnrestGroups(state, civId);
}

export function processCrisisSchedulerForHumans(state: GameState, bus: EventBus): GameState {
  let next = state;
  const humanIds = Object.values(state.civilizations)
    .filter(c => c.isHuman && !c.isEliminated).map(c => c.id).sort();
  for (const civId of humanIds) next = maybeStartCrisis(next, civId, bus);
  return next;
}

function maybeStartCrisis(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.cities.length === 0) return state;
  const profile = getChallengeProfileForCiv(state, civId);
  if (state.era <= profile.crisisGraceMaxEra) return state;
  if (state.turn < profile.crisisGraceMinTurns) return state;
  if (civ.lastCrisisOnsetTurn !== undefined &&
      state.turn - civ.lastCrisisOnsetTurn < profile.crisisCooldownTurns) return state;
  if (countActiveCrisesForCiv(state, civId) >= profile.maxIndependentCrisesPerHuman) return state;
  if (deriveActiveIndependentThreatIds(state, civId).length > 0) return state;
  const ledger = state.opponentAI?.pressureByHuman?.[civId];
  if (ledger?.lastResolvedThreatTurn !== undefined &&
      state.turn - ledger.lastResolvedThreatTurn < EXTERNAL_THREAT_RECENCY_TURNS) return state;

  const landmassIds = [...new Set(civ.cities.flatMap(cid => {
    const c = state.cities[cid];
    const rk = c ? state.map.tiles[hexKey(c.position)]?.regionKey : undefined;
    return rk ? [rk] : [];
  }))].sort();
  const maxScore = landmassIds.reduce((m, l) => Math.max(m, computeThreatScore(state, civId, l)), 0);
  if (maxScore < CRISIS_PRESSURE_FLOOR) return state;

  const rng = seededLcg(state.turn * 7919 + civId.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 31);
  const eligible = CRISIS_FLAVORS.filter(f =>
    state.era >= f.eraBand[0] && state.era <= f.eraBand[1] &&
    civ.cities.some(cid => { const c = state.cities[cid]; return !!c && f.geographyPredicate(state, c); }));
  if (eligible.length === 0) return state;
  const history = civ.recentCrisisHistory ?? [];
  const flavor = weightedPick(eligible, eligible.map(f => history.includes(f.id) ? 0.25 : 1.0), rng);
  const targets = civ.cities.map(cid => state.cities[cid])
    .filter((c): c is City => !!c && flavor.geographyPredicate(state, c));
  const target = weightedPick(targets, targets.map(c => Math.max(1, c.population)), rng);

  const crisisId = `crisis-${state.turn}-${civId}`;
  const crisis: ActiveCrisis = {
    id: crisisId, flavorId: flavor.id, archetype: flavor.archetype, targetCivId: civId,
    cityIds: [target.id], tileKeys: [], startedTurn: state.turn, stage: 'active', turnsInStage: 0,
  };
  const nextState: GameState = {
    ...state,
    activeCrises: { ...(state.activeCrises ?? {}), [crisisId]: crisis },
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        lastCrisisOnsetTurn: state.turn,
        recentCrisisHistory: [...history, flavor.id].slice(-4),
      },
    },
  };
  bus.emit('crisis:started', { crisisId, flavorId: flavor.id, civId, cityIds: [target.id] });
  return nextState;
}
```

(Adjust `bus.emit` to the EventBus API used elsewhere — grep `bus.emit(` in `src/systems/faction-system.ts` and match.)

- [ ] **Step 5: Run — PASS. Commit** — `feat(systems): crisis scheduler with per-player gating`

### Task 1.5: Outbreak resolver — tick, spread, responses, yield multiplier

**Files:**
- Modify: `src/systems/crisis-system.ts`
- Test: `tests/systems/crisis-outbreak.test.ts`

**Interfaces (produced):**

```ts
export function processCrisisTurn(state: GameState, bus: EventBus): GameState; // ticks all archetypes
export function applyQuarantine(state: GameState, crisisId: string, cityId: string):
  { success: boolean; state: GameState; message: string };
export function applyRemedy(state: GameState, crisisId: string, cityId: string):
  { success: boolean; state: GameState; message: string };
export function getCrisisYieldMultiplier(state: GameState, cityId: string): number;
export function resolveCrisis(state: GameState, crisisId: string, outcome: CrisisOutcome, bus: EventBus): GameState;
export function handleCityLeftCiv(state: GameState, cityId: string, bus: EventBus): GameState; // capture/raze → abandoned
```

Behavior to implement and test (each bullet = one test):
- **Tick:** `turnsInStage` increments each turn for every active crisis.
- **Yield multiplier:** afflicted city → `1 - yieldPenalty` (per target civ's challenge severity); quarantined city → `1 - 2*yieldPenalty`, floored at 0.25; unaffected city → 1. Multiplier composes multiplicatively across multiple crises on the same city.
- **Spread:** each turn, for each afflicted, non-quarantined city, roll once: base 20% + 15% if the flavor's `spreadBoostPredicate(state, candidateCity)` is true; target = nearest same-owner non-afflicted city (`hexDistance`); on success append to `cityIds`, emit `crisis:spread`. NEVER spreads to another civ's city (test with an adjacent enemy city closer than the own city).
- **Remedy completion:** when `state.turn >= remedyCompletionByCity[cityId]`, remove city from `cityIds` (and from quarantine list); when `cityIds` becomes empty → `resolveCrisis(..., 'contained')`.
- **Explorer auto-expiry:** when `turnsInStage >= autoExpireTurns` (explorer severity) → `resolveCrisis(..., 'expired')`.
- **Veteran pop loss:** every `popLossEveryNTurnsIgnored` turns, each afflicted city with no quarantine and no pending remedy loses 1 population (floor 1).
- **applyQuarantine:** free; adds cityId to `quarantinedCityIds`; idempotence guard (second call returns `success: false, message: 'Already quarantined.'`).
- **applyRemedy:** costs `getCityAppeaseCost(city)` gold (import from faction-system); fails with message when unaffordable; sets `remedyCompletionByCity[cityId] = state.turn + 2`; deducts gold.
- **handleCityLeftCiv:** any crisis whose `cityIds` includes the city → remove it; if that empties `cityIds` (or the crisis targeted only that city) → resolve `'abandoned'`.
- **resolveCrisis:** deletes from `activeCrises`, emits `crisis:resolved`.

Steps: write all tests first (use the fixture; one `describe` per bullet), run FAIL, implement, run PASS, then:
- [ ] **Commit** — `feat(systems): outbreak resolver with spread, quarantine, remedy`

### Task 1.6: Turn pipeline + save sanitation

**Files:**
- Modify: `src/core/turn-manager.ts` (three insertions), `src/storage/save-manager.ts`
- Test: `tests/core/turn-manager-crisis.test.ts`, extend save-manager tests

**Interfaces:** Consumes Task 1.5 exports.

- [ ] **Step 1: Failing tests** — (a) a full `processTurn`/end-turn cycle on a fixture with an active outbreak decrements city yields by the multiplier and ticks the crisis; (b) scheduler runs (fixture past grace fires a plague during end-turn); (c) a save JSON **without** any crisis fields loads and completes one turn without throwing; (d) a save with `activeCrises: { x: { flavorId: 'removed-flavor', ... } }` loads with that crisis dropped and a `console.warn` (spy on it); (e) save/load round-trip preserves an active crisis mid-arc (stage, turnsInStage, quarantine list survive); (f) capturing an afflicted city resolves its crisis `'abandoned'` (wire `handleCityLeftCiv` into the capture path — grep `src/systems/city-capture-system.ts` for where city ownership flips, and the raze path if separate).
- [ ] **Step 2: Wire.** In `turn-manager.ts`: after `processBreakawayTurn` (line ~132) add `newState = processCrisisTurn(newState, bus);`. Immediately after `processIndependentThreatPressureForHumans` (line ~960) add `newState = processCrisisSchedulerForHumans(newState, bus);`. Find where `getUnrestYieldMultiplier` multiplies city yields (grep its call sites in turn-manager) and multiply by `getCrisisYieldMultiplier(newState, city.id)` at the same site. At each civ's turn start (grep how `applyPendingOpponentChallenge` is applied for the pattern), apply `civ.pendingChallenge`: `if (civ.pendingChallenge) { challenge = pendingChallenge; pendingChallenge = undefined }`.
- [ ] **Step 3: Save sanitation.** In `save-manager.ts` load path, after deserialization: filter `state.activeCrises` entries where `getCrisisFlavor(c.flavorId)` is undefined, `console.warn('[save] dropping crisis with unknown flavor', c.flavorId)`.
- [ ] **Step 4: Run new tests + FULL suite (`yarn test`) — expect PASS.**
- [ ] **Step 5: Commit** — `feat(core): crisis turn pipeline + save sanitation`

### Task 1.7: Per-player challenge UI (hotseat setup + pause menu)

**Files:**
- Modify: `src/ui/hotseat-setup.ts`, `src/ui/pause-menu-panel.ts`, solo setup path (grep `opponentChallenge` in `src/ui/campaign-setup.ts` / `campaign-entry-flow.ts`)
- Test: `tests/ui/hotseat-setup-challenge.test.ts`, extend pause-menu tests

**Player truth table (required by docs/superpowers/plans/README.md):**

| Before | Action | Immediate visible result |
|---|---|---|
| Hotseat setup lists players | Player row's challenge selector changed to Explorer | Row shows "Explorer" selected; created game has `civ.challenge = 'explorer'` for that civ only |
| Pause menu open on P2's turn | P2 picks Veteran | Selector shows "Veteran (applies next turn)" note; only P2's civ gets `pendingChallenge` |
| Pause menu open on P2's turn | — | P1's challenge is NOT shown as editable |

- [ ] **Step 1: Failing DOM tests** for each truth-table row (follow existing `tests/ui/` patterns for DOM setup; assert with `textContent`, never innerHTML).
- [ ] **Step 2: Implement.** Hotseat setup: reuse `createOpponentChallengeSelector` (already exists in `src/ui/opponent-challenge-selector.ts`) once per human player row; write result to each civ's `challenge` at game creation. Solo: the existing single selector now ALSO writes `civ.challenge` on the human civ (keep writing `state.opponentChallenge` — it still governs AI behavior). Pause menu: render the selector bound to `state.currentPlayer`'s civ only; on change call a new `setPendingChallengeForCiv(state, civId, challenge)` helper in `opponent-challenge.ts` (same shape as `setPendingOpponentChallenge`, but on the civ; include the no-op/removal cases). Label with help text: "Your personal difficulty — affects crises and unrest for your empire only. Applies at the start of your next turn." Use `createGameButton` for any buttons (invoke `.claude/skills/button-styling.md` first).
- [ ] **Step 3: Run tests — PASS. Commit** — `feat(ui): per-player challenge picker in hotseat setup and pause menu`

### Task 1.8: City panel crisis UI + notifications + advisor

**Files:**
- Modify: `src/ui/city-panel.ts`, `src/ui/notification-routing.ts`, `src/ui/advisor-system.ts`, `src/main.ts`
- Test: `tests/ui/city-panel-crisis.test.ts`, extend notification-routing tests

**Player truth table:**

| Before | Action | Immediate visible result |
|---|---|---|
| City panel on afflicted city | — | Chip: era display name + "−25% yields" + advisor what-to-do line |
| Chip visible, city not quarantined | Tap "Quarantine (free)" | Panel rerenders: chip shows "Quarantined — spread stopped, −50% yields"; button disabled |
| Quarantined | Tap "Quarantine" again | No state change (idempotent), button already disabled |
| Gold < remedy cost | — | "Remedy (N gold)" button disabled with reason text "Not enough gold" |
| Gold ≥ cost | Tap "Remedy (N gold)" | Gold deducted in HUD, chip shows "Remedy underway — cured in 2 turns" |
| Unaffected city | — | No crisis chip present |

**Misleading-UI risks:** the chip must show the CURRENT stage, not onset text (a quarantined city saying "spreading!" lies). Negative test: quarantined city's chip does not contain "spread" warning. Remedy button while remedy pending must be disabled ("Remedy underway").

**Interaction replay checklist (tests must cover):** open panel → quarantine → rerender → attempt second quarantine → remedy on second afflicted city → rerender → cycle to next city and back (chip persists from state, not DOM).

- [ ] **Step 1: Failing DOM tests per truth-table row + both negative tests.**
- [ ] **Step 2: Implement.** Notification routing: add `routeCrisisStarted`, `routeCrisisSpread`, `routeCrisisResolved` following the existing `routeFactionTransition` per-player queue pattern (announce to `targetCivId` only, at their turn start; message = `getCrisisDisplayName(flavor, state.era)` + city name + the flavor's `advisorLine` with `{name}`/`{city}` substituted via `textContent`). Advisor: crisis entries surface while a crisis is active for `state.currentPlayer`. Wire events in `main.ts` next to the existing faction event wiring.
- [ ] **Step 3: Run — PASS. Commit** — `feat(ui): city-panel crisis chip, response actions, crisis notifications`

### Task 1.9: SFX + music hooks

**Files:**
- Modify: `src/audio/music-director.ts`, `src/main.ts` (event wiring)
- Test: `tests/audio/music-director-crisis.test.ts` (follow existing music-director test patterns)

- [ ] **Step 1: Failing test:** `setCrisisActiveForCurrentPlayer(true)` makes `resolveSnapshot()` return `'unrest'` when otherwise at peace; `false` restores `'peace'`; an at-war state still resolves `'at-war'` (priority unchanged).
- [ ] **Step 2: Implement.** In `MusicDirector`: private `crisisActiveForCurrentPlayer = false`; public `setCrisisActiveForCurrentPlayer(active: boolean)` that calls the same refresh path the unrest handlers use; in `resolveSnapshot()` (line ~80) change the unrest line to `if (this.inUnrest || this.crisisActiveForCurrentPlayer) return 'unrest';`. In `main.ts`: on turn start and on `crisis:started`/`crisis:resolved`, recompute `hasActiveCrisis = Object.values(state.activeCrises ?? {}).some(c => c.targetCivId === state.currentPlayer)` and call the setter — keyed to `state.currentPlayer` so music never spoils another player's hidden trouble. Onset stinger: find where the war-declared stinger fires (grep `warDeclared` in `src/audio/` and `src/main.ts`) and trigger the same stinger on `crisis:started` for the current player (placeholder until bespoke crisis stingers exist — note this in a comment). Resolution stinger: on `crisis:resolved` with outcome `'contained'` or `'recovered'` for the current player, fire the peace-signed stinger (`peaceSigned` in `src/audio/audio-catalog.ts`) via the same wiring pattern.
- [ ] **Step 3: Run — PASS. Commit** — `feat(audio): crisis music snapshot + onset stinger`

### Task 1.10: MR1 gate — balance, build, PR

- [ ] Run `bash scripts/run-with-mise.sh yarn vitest run tests/systems/pacing-audit.test.ts tests/systems/pacing-reference-economy.test.ts` — crisis penalties are transient so snapshots should NOT change; if they do, stop and investigate (do not update snapshots for this MR).
- [ ] Run FULL `yarn build` and `yarn test` — both exit 0.
- [ ] `gh pr create` — title `feat(crisis): MR1 — crisis framework, per-player challenge, plague outbreak`. Body: partial-work disclosure per `.claude/rules/incremental-mr-completion.md`: implements crisis framework + plague from the spec; catastrophes/hunts/uprising-extension follow in MR2–4; no dead-end UX (plague is fully playable).

---

# MR2 — Catastrophe archetype

Branch: `feat/crisis-mr2-catastrophes`. Deliverable: eruption/earthquake/flood/wildfire/harsh-winter fire as one-shock crises with devastated tiles, a restore worker action, recovery-window resilience bonus, and map tint.

### Task 2.1: Catastrophe flavors

**Files:** Modify `src/systems/crisis-flavor-definitions.ts`; test file from Task 1.3 auto-covers new rows.

Add `CatastropheParams` to `CrisisFlavor` (optional field `catastrophe?: { blastRadius: number; devastationTurns: number; destroysEpicenterImprovement: boolean }`) and five rows:

| id | eraBand | geographyPredicate (city …) | blastRadius | displayNamesByEra examples |
|---|---|---|---|---|
| `volcanic-eruption` | [2,12] | has `volcanic` tile within 3 | 2 | 2: "The Mountain of Fire Wakes", 7: "Cataclysmic Eruption" |
| `earthquake` | [2,12] | has `mountain` or `hills` within 2 | 2 | 2: "The Ground Trembles", 8: "The Great Quake" |
| `river-flood` | [2,12] | city tile `hasRiver` or terrain `coast` adjacent | 1 | 2: "The River Rises", 6: "The Hundred-Year Flood" |
| `wildfire` | [2,12] | ≥3 `forest` tiles within 2 | 2 | 2: "Fire on the Wind", 9: "Megafire" |
| `harsh-winter` | [2,12] | `tundra` or `snow` within 2 | 2 | 2: "The Long Winter", 5: "The Little Ice Age" |

Severity: reuse `CrisisSeverity.yieldPenalty` as the post-shock city penalty during recovery (explorer 0.10/standard 0.20/veteran 0.30); `devastationTurns`: explorer 4 / standard 8 / veteran 10 (store per-challenge inside `catastrophe` as `devastationTurnsByChallenge: Record<OpponentChallenge, number>`); `destroysEpicenterImprovement` true only meaningful on veteran era 3+ (resolver enforces). `responseActions: []` (catastrophes respond via worker restore, not city buttons). Extend the generic table test: every `archetype: 'catastrophe'` row must carry `catastrophe` params; every outbreak row must not.

Steps: extend generic test with the archetype-params invariant → FAIL → implement rows → PASS → commit `feat(systems): five catastrophe flavors`.

### Task 2.2: Shock + territory clipping + recovery + resilience

**Files:** Modify `src/systems/crisis-system.ts`; test `tests/systems/crisis-catastrophe.test.ts`.

**Interfaces produced:** internal `applyCatastropheShock(state, crisis, flavor, bus): GameState`; extends `processCrisisTurn`.

Behavior (one test each):
- On onset (scheduler creates catastrophe crisis with `stage: 'active'`), the shock applies on the SAME turn's `processCrisisTurn`: seeded-pick an epicenter tile within `blastRadius` of the target city that is **owned by the target civ**; all target-civ-owned tiles within `blastRadius` of the epicenter get `devastatedUntilTurn = turn + devastationTurns`; `tileKeys` records them; stage → `'recovery'`.
- Tiles owned by another civ or unowned are NEVER devastated (test: adjacent enemy tile untouched).
- Veteran + era ≥ 3 + `destroysEpicenterImprovement`: epicenter tile's `improvement` set to `'none'`. Standard/explorer: improvements untouched (devastation suppresses their yield instead).
- Devastated tiles contribute ZERO yields (implemented in Task 2.3).
- Recovery: if by `startedTurn + 5` every tile in `tileKeys` has been restored (devastation cleared early via worker action), each affected city gets `resilienceBonusUntilTurn = turn + 5` and crisis resolves `'recovered'`; otherwise when the last `devastatedUntilTurn` passes, resolves `'expired'` with no bonus.
- Explorer auto-recovery: devastation simply expires (4 turns) — resolver treats full natural expiry on explorer as `'recovered'` (kids get the win) but WITHOUT the resilience bonus unless they actually restored.

Commit: `feat(systems): catastrophe shock, territory clipping, recovery window`.

### Task 2.3: Devastation yields + restore worker action + resilience yields

**Files:** Modify `src/systems/city-work-system.ts` (or wherever worked-tile yields are summed — grep `calculateCityYields`), `src/systems/improvement-system.ts`, `src/core/types.ts` (`'restore_land'` in the worker-action union near line 1397); tests extend `tests/systems/city-work-system.test.ts` + `tests/systems/improvement-system.test.ts`.

- Devastated tile (`devastatedUntilTurn > state.turn`) yields zero from base terrain AND improvement.
- City with `resilienceBonusUntilTurn > state.turn` gets +1 food +1 production.
- New worker action `restore_land`: available only on a devastated tile owned by the worker's civ; 1-turn task; on completion clears `devastatedUntilTurn` and emits `improvement:completed`-style event (reuse `getAvailableWorkerActions` / `getWorkerActionBlockerReason` plumbing in improvement-system; add label "Restore Land" via `getWorkerActionLabel`).
- Balance gate: run pacing tests; the +1/+1 resilience is transient and must not shift era snapshots — verify.

Commit: `feat(systems): devastated tile yields, restore-land worker action, resilience bonus`.

### Task 2.4: Renderer + notifications for catastrophes

**Files:** Renderer tile-drawing module (grep `TERRAIN_COLORS` usage in `src/renderer/`), city marker layer, `src/ui/notification-routing.ts`; tests where renderer logic is testable (follow existing renderer test patterns; visual tint itself may be verified by inspection).

- Devastated tiles: dark desaturating overlay (e.g. `rgba(40,30,20,0.45)`) — drawn only where the viewing player has discovered the tile (respect existing fog rendering path; crisis markers must not reveal fog).
- Worker action button appears via existing worker-action UI (Task 2.3's plumbing does this — verify with a DOM test that a devastated owned tile with a worker shows "Restore Land").
- Onset notification: "{display name} strikes near {city}! Send workers to restore the land within 5 turns for a resilience bonus."
- Update the plague-only assumption anywhere in MR1 UI (chip text must handle `stage: 'recovery'`: "Recovering — restore devastated tiles").

Commit: `feat(renderer,ui): devastated tint + catastrophe notifications`. MR2 gate: full `yarn build` + `yarn test`, pacing tests unchanged, PR per incremental-MR rules.

---

# MR3 — Hunt archetype (closes #381)

Branch: `feat/crisis-mr3-hunts`. Deliverable: named foes spawn as crises, existing systems drive their behavior, kills resolve the crisis and feed the killer a feast bonus.

### Task 3.1: Hunt flavors + spawn orchestration

**Files:** Modify `src/systems/crisis-flavor-definitions.ts`, `src/systems/crisis-system.ts`; test `tests/systems/crisis-hunt.test.ts`.

Add `hunt?: { spawnKind: 'beast' | 'barbarian-camp' | 'pirate'; namePoolKey: string }` to `CrisisFlavor`. Rows:

| id | eraBand | geography | spawnKind |
|---|---|---|---|
| `beast-awakening` | [2,6] | `forest`/`mountain`/`jungle` within 4 of any city | `beast` |
| `bandit-uprising` | [2,8] | any land city | `barbarian-camp` |
| `corsair-armada` | [4,12] | any coastal city | `pirate` |

Spawn orchestration in `crisis-system.ts`:
- `beast`: pick an era-appropriate beast from `beast-definitions.ts` (grep for the roster accessor) and spawn its unit at a legal hex 3–5 tiles from the target city, outside the target civ's territory, using existing occupancy checks (grep the spawn-occupancy helper used by `spawnBarbarianCamp`). Store the unit id in `huntEntityId`, stage `'menacing'`.
- `barbarian-camp`: call `spawnBarbarianCamp` with era strength; `huntEntityId` = camp key.
- `pirate`: reuse `processPirateSpawn`'s fleet creation with a forced spawn (read that function first; extract its "create fleet near coast" core into a callable helper rather than duplicating).
- Named foe: reuse the bandit-name pattern — pick from `BANDIT_LORD_NAMES` via the target civ's type (export the existing pool + picker from threat-pressure-system rather than copying). Store the name on the crisis (`foeName: string` — add to `ActiveCrisis`).
- The foe's turn-to-turn behavior is 100% existing beast/barbarian/pirate AI. Do not add movement logic.

Tests: spawn legality (never inside target territory, occupancy respected, deterministic position for fixed seed); each spawnKind creates its entity; foe name present.

Commit: `feat(systems): hunt flavors with beast/camp/pirate spawn orchestration`.

### Task 3.2: Resolution, bounty, escalation, elimination handoff

**Files:** Modify `src/systems/crisis-system.ts`, `src/systems/faction-system.ts` (feast happiness); test extends `tests/systems/crisis-hunt.test.ts`.

- In `processCrisisTurn`, a hunt crisis resolves `'hunted'` when its entity no longer exists (`state.units[huntEntityId]` undefined / camp gone / fleet gone). Gold/hoard payouts to the killer already flow through existing beast-hoard / camp-destruction / fleet paths — do NOT add a second gold payout. Add ONLY the feast: on resolution, find the killer civ (subscribe in `main.ts` to the combat/camp-destruction event that carries the attacker — grep `applyCampDestruction` and beast-slain event wiring; record `lastHuntKillerCivId` on the crisis when the event fires, fall back to the target civ if unattributed) and set `killerCiv.feastUntilTurn = turn + 5`.
- `feastUntilTurn`: in `processFactionTurn`'s happiness input (it calls `getCivHappinessFromResources`), add `+2` while `feastUntilTurn > state.turn`. Test: unrest pressure drops by 4 (2 pressure per happiness point) during a feast.
- Veteran escalation: hunt at `turnsInStage >= 5` with stage `'menacing'` → stage `'assaulting'`, emit `crisis:escalated`; for `'assaulting'` barbarian-camp hunts, set the existing purposeful-barbarian objective toward the target city (grep `processPurposefulBarbarians` for the objective shape). Explorer/standard: never escalates.
- Target civ eliminated mid-hunt → resolve `'abandoned'`; entity persists (no cleanup of the world entity).

Commit: `feat(systems): hunt resolution, beast-slayer feast, veteran escalation`.

### Task 3.3: Hunt UI + notifications

**Files:** `src/ui/notification-routing.ts`, `src/ui/advisor-system.ts`, renderer marker layer; test extends `tests/ui/` crisis tests.

- Onset: "{foeName} has awoken near {city}! Slay it to end the threat — any civilization may claim the hunt." (routed to target civ; other civs learn of the foe by normal visibility).
- Foe banner: name label rendered above the hunt entity on the map (fog-aware — only when visible to the viewing player). Follow the existing last-seen/label presentation patterns (`src/systems/last-seen-presentation.ts` consumers).
- Resolution: killer civ gets "The beast-slayer's feast begins! (+2 happiness, 5 turns)"; target civ (if different) gets "{foeName} has been slain by {killerCiv}."
- MR3 gate: full build+test, PR. **Close #381 in the PR body** (`Closes #381`).

---

# MR4 — Uprising extension: contagion + concession (closes #354)

Branch: `feat/crisis-mr4-uprising`. Deliverable: revolt contagion with garrison immunity, ideological concession with civics discount + immunity, city-panel surfacing.

### Task 4.1: Contagion pressure term

**Files:** Modify `src/systems/faction-system.ts` (`computeUnrestPressure` + `processFactionTurn`), `src/core/types.ts` (events); test extends `tests/systems/faction-system.test.ts`.

- New derived pressure term in `computeUnrestPressure` (keeps events-vs-state purity — contagion is computed, not accumulated): for each **same-owner** city at `unrestLevel === 2` within `CONTAGION_GROUP_RANGE` (3) hexes of this city, add `+8 × crisisSeverityMultiplier` (owner's per-civ profile; import `getChallengeProfileForCiv`), capped at `MAX_PRESSURE_CONTAGION = 16`. Skip entirely when: this city is garrisoned (`canGarrisonCity`) or has `concessionImmunityUntilTurn > state.turn`.
- `processFactionTurn`: when a city crosses from stable to unrest AND the contagion term is > 0, emit `'faction:contagion-spread'` `{ fromCityId, toCityId, owner }` (fromCityId = nearest revolting neighbor). The existing `faction:unrest-started` event still fires — music counters stay correct automatically.
- Tests: pressure adds for revolt-neighbor; garrison immune; immunity window immune; explorer multiplier halves the term; AI-owner civs use game-wide challenge (resolution order test); event fires once on crossing, not every turn.

Commit: `feat(faction): revolt contagion pressure with garrison immunity`.

### Task 4.2: Ideological concession

**Files:** Modify `src/systems/faction-system.ts`; test extends faction tests.

```ts
export function getConcessionCost(state: GameState, city: City): number;
// 2 × getCityAppeaseCost(city); 1 × if owner researched any track==='civics' tech with era === state.era
export function concedeToMovement(state: GameState, cityId: string, civId: string):
  { success: boolean; state: GameState; message: string };
```

- Success: deduct gold; set `unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, concessionImmunityUntilTurn: state.turn + 15`; emit `'faction:concession-made'` `{ cityId, owner, concessionType: 'charter' }`. Failure messages: no unrest / not enough gold (mirror `appeaseFaction`'s result shape exactly).
- Civics check: read researched tech ids from the civ's tech state (grep how `appeaseFaction` callers access researched techs; use `tech-definitions`' lookup to check `track === 'civics' && era === state.era`).
- Tests: full clear + immunity set; cost halves with current-era civics tech; no new unrest can start during immunity (integration with `processFactionTurn`); appease still available and still only suppresses.

Commit: `feat(faction): ideological concession with civics discount`.

### Task 4.3: Uprising UI

**Files:** `src/ui/city-panel.ts`, `src/ui/notification-routing.ts`; test `tests/ui/city-panel-uprising.test.ts`.

**Player truth table:**

| Before | Action | Immediate visible result |
|---|---|---|
| City at revolt; neighbor city stable ungarrisoned | — | Neighbor's panel shows "Unrest is spreading from {city} (+N pressure/turn) — garrison a unit to block it" |
| Neighbor garrisoned | — | Spread warning absent (negative test) |
| Revolting city panel | Tap "Concede (N gold)" | Unrest chip clears, "Immune to unrest for 15 turns" note appears, gold deducted |
| Gold < cost | — | Concede button disabled with "Not enough gold" |
| City under concession immunity | — | Appease AND Concede buttons absent; immunity note shown |

Misleading-UI risk: the spread warning must only appear when the contagion term is actually > 0 for that city (garrison/immunity suppress it) — the negative tests above prove the boundary. Replay: concede → rerender → cycle cities → return (immunity note persists from state).

Commit: `feat(ui): contagion warnings + concession action in city panel`. MR4 gate: full build+test, PR body `Closes #354`.

---

# MR5 — Flavor breadth pass

Branch: `feat/crisis-mr5-breadth`. Deliverable: roster depth so repeat play stays fresh. All rows ride existing resolvers — this MR touches ONLY `crisis-flavor-definitions.ts`, name pools, and copy.

### Task 5.1: Three more outbreaks + two more hunts

- Outbreaks: `crop-blight` (geography: ≥2 farm improvements in city territory or grassland/plains city; spreadBoost: plains), `locust-swarm` (plains/grassland within 2; eraBand [2,8]), `red-tide` (coastal city; spreadBoost: coast; eraBand [3,12]). Era names each (e.g. blight 2: "The Withering", 6: "The Potato Blight"; locusts 2: "The Devouring Cloud"; red tide 3: "The Crimson Waters").
- Hunts: `dire-pack` (eraBand [2,4], beast, forest/tundra) and `kraken-sighting` (eraBand [5,12], beast, ocean within 3 — confirm a sea-capable beast exists in `beast-definitions.ts`; if none, use pirate spawnKind with a sea-monster name pool and note it).
- The Task 1.3 generic test auto-covers all rows; extend era-name spot checks.
- Balance: yieldPenalty ceilings stay ≤ 0.5 per the table test; run pacing gate.

Commit per flavor group; MR5 gate: full build+test, PR.

---

## Cross-MR verification (run at every MR gate)

- [ ] `bash scripts/run-with-mise.sh yarn build` — exit 0 (only tsc path).
- [ ] `bash scripts/run-with-mise.sh yarn test` — exit 0.
- [ ] Hotseat smoke: 2-human fixture test proving P2's crisis notifications never reach P1 and P1's challenge never affects P2's severity.
- [ ] Old-save fixture test still passes (no crisis fields → clean load).
- [ ] Pacing snapshots unchanged (or PR includes updated numbers + one-line justification per `.claude/rules/game-balance.md`).

## Execution Handoff

Plan complete. Per the user's direction this plan is sliced into GitHub issues (one per MR) plus an index issue, executed MR-by-MR in fresh worktrees.
