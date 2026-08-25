# #545 MR3 — Strategic Strike Resolution & Fallout Implementation Plan

✅ executed 2026-08-25 (pre-merge; PR not yet opened). All 4 tasks complete, full
suite green (534 files / 9025 tests), `yarn build` clean, zero pacing-audit diff.
Two review passes ran before execution (per the MR2 hand-off's own guidance to
repeat that process): the first caught two missing legality-passthrough test cases
and a "four vs five" wording bug in the Definition of Done; the second caught a
missing state-immutability regression test and a dead fallout edge-case branch
(defending civ owns no tile in blast radius) with no test coverage. Both passes'
findings were fixed in the plan before any code was written, so execution itself
surfaced no further gaps.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. **Do not use subagent-driven-development or
> any other subagent-dispatching approach for this repo** — this project's
> `CLAUDE.md` explicitly forbids subagents/parallel agents; execute every task
> inline in the current session. Steps use checkbox (`- [x]`) syntax for
> tracking.

> **Fresh audit (2026-08-25, against `origin/main` post-MR2/#897):** every claim
> the design spec and the MR3 hand-off doc make about current code was re-verified
> directly against the file, not carried forward on trust (per
> `.claude/rules/spec-fidelity.md`). Confirmed exact/unchanged: `resolveCitySiegeDamage`
> / `applyCitySiegeOutcome` (`city-siege-system.ts:172-244`), `getStrategicLaunchLegality`
> (`strategic-launch-system.ts:62-83`, the four-condition resolver: arsenal ≥ 1,
> discovered, at war, in-range platform), `getStrategicArsenal`/`addWarheadToArsenal`
> (`strategic-arsenal-system.ts`), the `devastatedUntilTurn` tile primitive and
> `crisis-system.ts`'s `applyCatastropheShock` (`crisis-system.ts:440-509`) as the
> pattern to mirror, `air-operations-system.ts`'s `resolveAirStrike`
> (`air-operations-system.ts:288-336`) as the closest existing analog for an
> `attackerDomain: 'air'` siege caller (`era`/`challenge` resolved via
> `resolveCivilizationEra(ownerCiv.techState.completed)` /
> `resolveChallengeForCiv(state, cityOwner)` — this MR follows the same convention).

> **Real discrepancy found during this audit — changes the plan (read before Task 2):**
> the design spec's §7 says a strike forces `preventDestruction: true` and the harshest
> outcome is "sacked's floor (1 HP, ... existing gold-loss rule), no change needed
> there." This is **wrong about the current code**, not a design change the spec
> intended silently — verified directly against `resolveCitySiegeDamage`
> (`city-siege-system.ts:172-207`): the `preventDestruction` branch is checked *before*
> the era/last-city destroy check and *before* the `'sacked'` branch's gold-loss line —
> it returns `{ outcome: 'damaged', newHp: 1, goldLost: 0 }` unconditionally, the same
> shape `naval-city-bombardment-system.ts` already relies on for offshore bombardment
> (confirmed: that file is the only other `preventDestruction: true` caller in the
> codebase, and its zero-gold-loss behavior is its own existing, intentional contract —
> not something this MR may change). So `preventDestruction: true` alone gives a strike
> a free 1-HP floor with **no gold loss at all**, not the sack-equivalent consequence
> the spec describes. Per `.claude/rules/spec-fidelity.md`'s "Specs Can Be Stale About
> Current Code": the spec's *intent* (a strike should be strictly harsher than a
> bombardment run — 1 HP floor **and** gold loss, per the sack precedent) is a real,
> locked product decision from the design review; only its factual claim about the
> current code is wrong. **Decision for this plan:** keep
> `city-siege-system.ts`'s shared pipeline and `naval-city-bombardment-system.ts`'s
> existing no-gold-loss behavior completely unchanged (no shared-pipeline risk to other
> callers), and apply the sack-equivalent gold loss as one explicit extra step inside
> the new strike resolver itself, reusing the exact `SACK_GOLD_LOSS_FRACTION` constant
> (exported read-only in Task 2, value unchanged) the real `'sacked'` branch already
> uses. This is a deliberate, stated deviation from the spec's literal text in service
> of its actual intent — noted here, in the strike resolver's own code comment (Task 2),
> and in this plan's PR body, exactly as `spec-fidelity.md` requires when a spec's
> current-code claim turns out to be wrong.

**Goal:** Build the §7/§8 strategic-strike resolver: a single new pure function,
`resolveStrategicStrike(state, actorCivId, targetCityId)`, that gates on the existing
MR2 legality resolver, applies overwhelming city damage through the *existing*
`resolveCitySiegeDamage`/`applyCitySiegeOutcome` pipeline (never a new damage path),
applies the sack-equivalent gold-loss consequence the spec locks in (see finding above),
devastates the defending civ's own tiles around the struck city using the existing
`devastatedUntilTurn` primitive, and spends one warhead from the actor's arsenal.
**No launch UX, no target-selection UI, no AI doctrine, no `warchief` panel — those are
MR4/MR5.** This MR's only deliverable is a backend function tested via direct calls —
exactly as `.claude/rules/incremental-mr-completion.md` requires this to be stated
explicitly, not assumed.

**Incremental-delivery decision (`.claude/rules/incremental-mr-completion.md`,
explicit per this MR's spec phasing and the hand-off doc's own instruction to decide
this deliberately):** MR3 introduces **zero player-facing surface**. There is no
"Prepare Strategic Launch" button, no target picker, no confirmation dialog, no new
notification, no panel change — nothing a player can click. `resolveStrategicStrike`
is a pure state-transform function with no caller anywhere in `src/main.ts`,
`src/app/`, or any UI/renderer module; it is tested exclusively via direct function
calls, the same shape MR2's `getStrategicLaunchLegality` shipped in. This is safe
because there is no dead-end UX to create: a function nothing calls cannot mislead or
half-work in front of a player. MR4 owns wiring an actual "Prepare Strategic Launch"
action to this resolver, plus the confirmation/preview flow and reputation/witness
consequences (spec §11, §14).

**Architecture:** One new leaf module, `src/systems/strategic-strike-system.ts` —
same shape as `strategic-launch-system.ts` and `strategic-arsenal-system.ts` (pure,
zero UI/renderer/AI imports). It composes three existing systems
(`getStrategicLaunchLegality`, `resolveCitySiegeDamage`/`applyCitySiegeOutcome`,
`spendStrategicArsenal` — new, symmetric to MR2's `addWarheadToArsenal`) plus one new
internal helper (`applyStrategicFallout`, not exported — mirrors
`crisis-system.ts`'s `applyCatastropheShock` in spirit but is simpler: a strategic
strike's blast center is the struck city's own fixed position, not a randomly chosen
epicenter within a candidate list, so no RNG is needed anywhere in this module — see
Task 4's explicit determinism check).

**Tech Stack:** TypeScript, Vitest. No new dependencies.

## Global Constraints

- No `Math.random()` anywhere in this MR. No RNG at all, in fact — see the
  Architecture note above and Task 4's explicit check. If a reviewer disagrees and
  wants a randomized epicenter/tile-subset instead of "devastate the full owned
  radius", that is a scope change requiring an explicit decision, not a silent
  addition.
- `strategic-strike-system.ts` never imports from `src/ui/`, `src/renderer/`, or
  `src/ai/`.
- `resolveStrategicStrike` MUST call `getStrategicLaunchLegality` for all four legality
  conditions — never reimplement arsenal/discovery/war/range checks locally.
- `resolveStrategicStrike` MUST call `resolveCitySiegeDamage`/`applyCitySiegeOutcome`
  for city HP effects — never a new damage formula. `attackerDomain: 'air'`,
  `preventDestruction: true`, always — regardless of era or last-city status.
- Do not touch `naval-city-bombardment-system.ts` or `city-siege-system.ts`'s shared
  branch behavior. The only change to `city-siege-system.ts` is exporting the existing
  `SACK_GOLD_LOSS_FRACTION` constant (Task 2) — its value and every existing caller's
  behavior stay identical.
- Do not add a "Prepare Strategic Launch" button, target-selection UI, or any other
  launch-flow UI element this MR — that's MR4 (§14).
- Do not add AI launch/retaliation doctrine this MR — that's MR5 (§10). This MR's
  `resolveStrategicStrike` has no AI-specific caller or branch.
- Fallout devastation applies to the **defending civ's own owned tiles**, unconditional
  on whether the garrison blocked HP damage — spec §8 has no `hasGarrison` clause;
  only §7's HP-damage path does. Document this reading explicitly in code (Task 3) since
  it is a real interpretive call, not spelled out verbatim in the spec.
- `blastRadius: 3`, `devastationTurnsByChallenge: { explorer: 8, standard: 14,
  veteran: 18 }` — spec-locked exact values, distinct from catastrophe's own
  2/{4,8,10} table (a strike is deliberately worse).
- Fallout severity resolution MUST use `resolvePressureSeverityForCiv(state,
  defendingCivId)` (world-pressure symmetry: AI defenders always get `'standard'`,
  never an inverted-difficulty value) — **not** `resolveChallengeForCiv`, which is used
  instead for the `resolveCitySiegeDamage` `challenge` input, matching
  `air-operations-system.ts`'s existing precedent exactly. These are two different
  helpers for two different purposes in this same function — see
  `opponent-challenge.ts:134-156`'s own comments for why they must not be swapped.
- Full repo test command: `bash scripts/run-with-mise.sh yarn test`. Full
  build/typecheck: `bash scripts/run-with-mise.sh yarn build`. Both must pass before
  this MR's PR, per `CLAUDE.md`.
- Design source of truth: `docs/superpowers/specs/2026-08-25-issue-545-strategic-deterrence-design.md`
  §6 (legality, reused unchanged), §7 (strike resolution), §8 (fallout), Determinism.

---

### Task 1: `spendStrategicArsenal` — decrement on successful launch

**Files:**
- Modify: `src/systems/strategic-arsenal-system.ts`
- Test: `tests/systems/strategic-arsenal-system.test.ts`

**Interfaces:**
- Consumes: `getStrategicArsenal(civ): number` (existing, same file).
- Produces: `spendStrategicArsenal(state: GameState, civId: string): GameState` —
  consumed by Task 2's `resolveStrategicStrike`.

- [x] **Step 1: Write the failing tests**

Append to `tests/systems/strategic-arsenal-system.test.ts` (after the existing
`describe('addWarheadToArsenal', ...)` block, same file, same `makeState`/`makeCiv`
helpers already defined above it):

```typescript
import { spendStrategicArsenal } from '@/systems/strategic-arsenal-system';

describe('spendStrategicArsenal', () => {
  it('decrements strategicArsenal by 1', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 3 }) } });
    const next = spendStrategicArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(2);
  });

  it('floors at 0 rather than going negative', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 0 }) } });
    const next = spendStrategicArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(0);
  });

  it('floors at 0 when strategicArsenal is absent (legacy save)', () => {
    const state = makeState({ civilizations: { p1: makeCiv() } });
    const next = spendStrategicArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(0);
  });

  it('is a no-op (returns the same state) for an unknown civ', () => {
    const state = makeState();
    expect(spendStrategicArsenal(state, 'nobody')).toBe(state);
  });

  it('does not mutate the input state', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 2 }) } });
    spendStrategicArsenal(state, 'p1');
    expect(state.civilizations.p1.strategicArsenal).toBe(2);
  });
});
```

Note: the import line at the top of the test file already imports from
`@/systems/strategic-arsenal-system`; add `spendStrategicArsenal` to that existing
import statement instead of a second `import` line for the same module — check the
file's line 3 before adding.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system -t spendStrategicArsenal`
Expected: FAIL — `spendStrategicArsenal is not a function` / not exported.

- [x] **Step 3: Implement**

In `src/systems/strategic-arsenal-system.ts`, immediately after `addWarheadToArsenal`
(end of file), add:

```typescript
/**
 * Spend one warhead on a successful strategic strike (#545 MR3, strategic-strike-system.ts
 * calls this only after getStrategicLaunchLegality confirms strategicArsenal >= 1).
 * Floors at 0 defensively -- callers are expected to have already checked legality,
 * but this must never go negative, matching getStrategicArsenal's "absent means zero"
 * convention. Immutable, no-op for an unknown civ, same shape as addWarheadToArsenal.
 */
export function spendStrategicArsenal(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, strategicArsenal: Math.max(0, getStrategicArsenal(civ) - 1) },
    },
  };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system`
Expected: PASS, all tests in the file (existing + new).

- [x] **Step 5: Commit**

```bash
git add src/systems/strategic-arsenal-system.ts tests/systems/strategic-arsenal-system.test.ts
git commit -m "feat(#545): add spendStrategicArsenal for strike-resolution arsenal spend"
```

---

### Task 2: `resolveStrategicStrike` — legality gate, siege damage, gold loss, arsenal spend

**Files:**
- Modify: `src/systems/city-siege-system.ts` (export `SACK_GOLD_LOSS_FRACTION`)
- Create: `src/systems/strategic-strike-system.ts`
- Create: `tests/systems/strategic-strike-system.test.ts`

**Interfaces:**
- Consumes: `getStrategicLaunchLegality(state, actorCivId, targetCityId):
  StrategicLaunchLegalityResult` (`strategic-launch-system.ts`, unchanged);
  `resolveCitySiegeDamage(input: CitySiegeInput): CitySiegeResult` and
  `applyCitySiegeOutcome(state, cityId, result): GameState` and
  `getCityGarrisonUnit(units, city): Unit | undefined` and (new export)
  `SACK_GOLD_LOSS_FRACTION: number` (all `city-siege-system.ts`, unchanged behavior);
  `spendStrategicArsenal(state, civId): GameState` (Task 1);
  `resolveCivilizationEra(completedTechIds): number` (`tech-definitions.ts`);
  `resolveChallengeForCiv(state, civId): OpponentChallenge` (`opponent-challenge.ts`).
- Produces: `resolveStrategicStrike(state, actorCivId, targetCityId):
  StrategicStrikeResult` — the `{ ok: true, state, platform, cityResult, goldLost }
  | { ok: false, reason }` shape Task 3 extends with `devastatedTileKeys`.

- [x] **Step 1: Export `SACK_GOLD_LOSS_FRACTION`**

In `src/systems/city-siege-system.ts`, change:

```typescript
const SACK_GOLD_LOSS_FRACTION = 0.15;
```

to:

```typescript
export const SACK_GOLD_LOSS_FRACTION = 0.15;
```

This is the only change to this file in this MR — value and every existing caller's
behavior are unchanged; it is exported so `strategic-strike-system.ts` can reuse the
exact same constant instead of duplicating the magic number (see the plan header's
"Real discrepancy found" note for why this resolver needs it directly).

- [x] **Step 2: Write the failing tests**

Create `tests/systems/strategic-strike-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { City, Civilization, GameState, HexCoord, HexTile } from '@/core/types';
import { resolveStrategicStrike } from '@/systems/strategic-strike-system';
import { hexKey, hexesInRange } from '@/systems/hex-utils';

const ACTOR_CITY_POS: HexCoord = { q: -10, r: -10 };
const TARGET_POS: HexCoord = { q: 0, r: 0 };

const AT_PEACE = {
  relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
  vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
};
const attackerAtWar = { ...AT_PEACE, atWarWith: ['defender'] };
const defenderAtWar = { ...AT_PEACE, atWarWith: ['attacker'] };

function makeTile(coord: HexCoord, owner: string | null, overrides: Partial<HexTile> = {}): HexTile {
  return {
    coord, terrain: 'hills', elevation: 'lowland', resource: null, improvement: 'none',
    owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null, ...overrides,
  };
}

function makeCiv(overrides: Partial<Civilization> = {}): Civilization {
  return {
    id: 'attacker', name: 'Attacker', color: '#fff', isHuman: true, civType: 'generic',
    cities: [], units: [], gold: 1000, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: AT_PEACE,
    ...overrides,
  } as Civilization;
}

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'target', name: 'Target', owner: 'defender', position: TARGET_POS,
    population: 5, food: 0, foodNeeded: 20, buildings: [], productionQueue: [],
    productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'city',
    ...overrides,
  } as City;
}

// Owns every tile within radius 4 of the target city (so Task 3's blast-radius-3
// boundary test has both included and excluded tiles to check) plus the attacker's
// own silo-city tile far away. p1 (attacker) can see the target (visibility fixture
// below) and is at war with the defender; the defender is undefended (no garrison
// unit) unless a test overrides `units`.
function makeStrikeState(overrides: Partial<GameState> = {}): GameState {
  const tiles: Record<string, HexTile> = {};
  for (const coord of hexesInRange(TARGET_POS, 4)) {
    tiles[hexKey(coord)] = makeTile(coord, 'defender');
  }
  tiles[hexKey(ACTOR_CITY_POS)] = makeTile(ACTOR_CITY_POS, 'attacker');

  return {
    turn: 50, era: 10, currentPlayer: 'attacker', gameOver: false, winner: null,
    map: { width: 60, height: 60, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      silo: { id: 'silo', name: 'Silo City', owner: 'attacker', position: ACTOR_CITY_POS, buildings: ['missile_silo'] } as any,
      target: makeCity(),
    },
    civilizations: {
      attacker: makeCiv({
        id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar,
        visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
      }),
      defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
    },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [],
    settings: {} as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 1, nextCityId: 1, nextRouteId: 1 },
    ...overrides,
  } as GameState;
}

describe('resolveStrategicStrike (#545 MR3 §7)', () => {
  it('legal strike against an undefended city: floors HP to 1, applies sack-equivalent gold loss, spends one warhead', () => {
    const state = makeStrikeState();
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.cityResult.outcome).toBe('damaged');
    expect(result.cityResult.newHp).toBe(1);
    expect(result.state.cities.target.hp).toBe(1);
    // gold loss is applied by this resolver, not by cityResult.goldLost (see plan header).
    expect(result.cityResult.goldLost).toBe(0);
    expect(result.goldLost).toBe(150); // 1000 * 0.15
    expect(result.state.civilizations.defender.gold).toBe(850);
    expect(result.state.civilizations.attacker.strategicArsenal).toBe(0);
  });

  it('a garrisoned defender fully blocks HP damage and gold loss (unchanged hasGarrison gate)', () => {
    const state = makeStrikeState({
      units: { garrison: { id: 'garrison', type: 'warrior', owner: 'defender', position: TARGET_POS } as any },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.cityResult.outcome).toBe('blocked');
    expect(result.state.cities.target.hp).toBeUndefined(); // untouched -- applyCitySiegeOutcome is a no-op on 'blocked'
    expect(result.goldLost).toBe(0);
    expect(result.state.civilizations.defender.gold).toBe(1000);
    // Arsenal is still spent -- the launch happened; a garrison blocking damage
    // doesn't un-launch the warhead.
    expect(result.state.civilizations.attacker.strategicArsenal).toBe(0);
  });

  it('never destroys the city, even at an era past the normal destruction threshold', () => {
    // Defender has exactly one city ('target') and era 12 is well past every
    // difficulty's citySiegeDestructionEra -- both conditions that would normally
    // reach resolveCitySiegeDamage's 'destroyed' branch. preventDestruction: true
    // intercepts before that branch is ever reached, regardless.
    const state = makeStrikeState({ era: 12 });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.cityResult.outcome).not.toBe('destroyed');
    expect(result.state.cities.target).toBeDefined();
    expect(result.state.cities.target.hp).toBe(1);
  });

  it('rejects an illegal strike (no-arsenal) without touching state, reusing the MR2 legality resolver', () => {
    const state = makeStrikeState({
      civilizations: {
        ...makeStrikeState().civilizations,
        attacker: makeCiv({ id: 'attacker', cities: ['silo'], strategicArsenal: 0, diplomacy: attackerAtWar, visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} } }),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    expect(result).toEqual({ ok: false, reason: 'no-arsenal' });
  });

  it('rejects an illegal strike (not-at-war) — the hot-seat-accident guardrail', () => {
    const state = makeStrikeState({
      civilizations: {
        ...makeStrikeState().civilizations,
        attacker: makeCiv({ id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: AT_PEACE, visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} } }),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    expect(result).toEqual({ ok: false, reason: 'not-at-war' });
  });

  it('rejects an unknown target city', () => {
    const result = resolveStrategicStrike(makeStrikeState(), 'attacker', 'nobody');
    expect(result).toEqual({ ok: false, reason: 'unknown-target-city' });
  });

  it('rejects with target-not-discovered when the target city has not been explored', () => {
    const state = makeStrikeState({
      civilizations: {
        ...makeStrikeState().civilizations,
        attacker: makeCiv({ id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar, visibility: { tiles: {}, lastSeen: {} } }),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    expect(result).toEqual({ ok: false, reason: 'target-not-discovered' });
  });

  it('rejects with no-eligible-platform when arsenal/war/discovery are satisfied but no platform is in range', () => {
    const state = makeStrikeState({
      cities: {
        // no silo/sub anywhere -- 'silo' city has no capability-granting building
        silo: { id: 'silo', name: 'Silo City', owner: 'attacker', position: ACTOR_CITY_POS, buildings: [] } as any,
        target: makeCity(),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    expect(result).toEqual({ ok: false, reason: 'no-eligible-platform' });
  });

  it('does not mutate the input state on a successful strike', () => {
    const state = makeStrikeState();
    resolveStrategicStrike(state, 'attacker', 'target');
    expect(state.cities.target.hp).toBeUndefined();
    expect(state.civilizations.defender.gold).toBe(1000);
    expect(state.civilizations.attacker.strategicArsenal).toBe(1);
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-strike-system`
Expected: FAIL — `Cannot find module '@/systems/strategic-strike-system'`.

- [x] **Step 4: Implement**

Create `src/systems/strategic-strike-system.ts`:

```typescript
import type { GameState } from '@/core/types';
import {
  getStrategicLaunchLegality,
  type StrategicLaunchLegalityFailure,
  type StrategicLaunchPlatform,
} from '@/systems/strategic-launch-system';
import { spendStrategicArsenal } from '@/systems/strategic-arsenal-system';
import {
  applyCitySiegeOutcome,
  getCityGarrisonUnit,
  resolveCitySiegeDamage,
  SACK_GOLD_LOSS_FRACTION,
  type CitySiegeResult,
} from '@/systems/city-siege-system';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

// #545 spec §7: "an overwhelming, deterministic rawDamage value (large enough to
// floor almost any target)". Worst realistic stacked city defense against an 'air'
// attacker (walls x1.25 * professional-army x1.10 = 1.375 multiplier; bunker +8 and
// fortification-engineering +5 = 13 flatBonus; bunker's 0.85 air-bombardment
// mitigation -- see getCityDefenseBreakdown, combat-system.ts) only needs
// rawDamage >= ~183 to floor a full-HP (100) city: mitigatedDamage =
// round(rawDamage * 0.85 / 1.375) - 13 >= 100. 9999 is a wide, legible safety
// margin -- not a tuned combat value, deliberately far from any realistic HP total.
const STRATEGIC_STRIKE_RAW_DAMAGE = 9999;

export type StrategicStrikeFailure = StrategicLaunchLegalityFailure;

export type StrategicStrikeResult =
  | {
    ok: true;
    state: GameState;
    platform: StrategicLaunchPlatform;
    cityResult: CitySiegeResult;
    /** Gold lost by the defending civ, applied by this resolver -- see this file's
     * header comment on resolveStrategicStrike for why this is not cityResult.goldLost. */
    goldLost: number;
  }
  | { ok: false; reason: StrategicStrikeFailure };

/**
 * #545 spec §7: resolves a strategic strike against `targetCityId` on behalf of
 * `actorCivId`. Reuses getStrategicLaunchLegality (MR2) as the sole legality gate --
 * never reimplements any of its four conditions -- then feeds an overwhelming
 * rawDamage through the EXISTING resolveCitySiegeDamage/applyCitySiegeOutcome
 * pipeline with attackerDomain: 'air' and preventDestruction: true forced
 * (product decision: "ruin, never delete" -- the harshest HP outcome is always the
 * 1-HP floor, never 'destroyed', regardless of era or last-city status).
 *
 * Gold loss: resolveCitySiegeDamage's own preventDestruction branch returns
 * goldLost: 0 unconditionally -- verified directly against the function; that is
 * naval-city-bombardment-system.ts's existing, unchanged contract, not something
 * this MR may alter. The design spec locks in a stricter outcome for a strategic
 * strike specifically (1-HP floor AND the same gold loss the normal 'sacked' branch
 * would have applied). This resolver applies that as an explicit extra step, reusing
 * SACK_GOLD_LOSS_FRACTION unchanged, rather than modifying the shared siege pipeline.
 * STRATEGIC_STRIKE_RAW_DAMAGE is overwhelming enough that !hasGarrison always means
 * "the preventDestruction floor was hit" for this caller (see that constant's own
 * comment) -- so gating the extra gold loss on hasGarrison alone is exact, not a
 * heuristic guess at cityResult's shape.
 *
 * Arsenal: spends exactly one warhead via spendStrategicArsenal on every legal
 * strike, whether or not a garrison blocked the HP/gold effects -- the launch itself
 * consumed the warhead regardless of what happened at the target.
 */
export function resolveStrategicStrike(
  state: GameState,
  actorCivId: string,
  targetCityId: string,
): StrategicStrikeResult {
  const legality = getStrategicLaunchLegality(state, actorCivId, targetCityId);
  if (!legality.ok) return { ok: false, reason: legality.reason };

  const targetCity = state.cities[targetCityId]!;
  const targetCiv = state.civilizations[targetCity.owner]!;
  const hasGarrison = getCityGarrisonUnit(state.units, targetCity) !== undefined;

  const cityResult = resolveCitySiegeDamage({
    city: targetCity,
    ownerCiv: targetCiv,
    rawDamage: STRATEGIC_STRIKE_RAW_DAMAGE,
    attackerDomain: 'air',
    hasGarrison,
    preventDestruction: true,
    era: resolveCivilizationEra(targetCiv.techState.completed),
    challenge: resolveChallengeForCiv(state, targetCity.owner),
  });

  let nextState = applyCitySiegeOutcome(state, targetCityId, cityResult);

  const goldLost = hasGarrison ? 0 : Math.round(targetCiv.gold * SACK_GOLD_LOSS_FRACTION);
  if (goldLost > 0) {
    const updatedCiv = nextState.civilizations[targetCiv.id]!;
    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [targetCiv.id]: { ...updatedCiv, gold: Math.max(0, updatedCiv.gold - goldLost) },
      },
    };
  }

  nextState = spendStrategicArsenal(nextState, actorCivId);

  return { ok: true, state: nextState, platform: legality.platform, cityResult, goldLost };
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-strike-system city-siege-system`
Expected: PASS — the new file's tests, and `city-siege-system.test.ts` unaffected by
the export-only change.

- [x] **Step 6: Commit**

```bash
git add src/systems/city-siege-system.ts src/systems/strategic-strike-system.ts tests/systems/strategic-strike-system.test.ts
git commit -m "feat(#545): add resolveStrategicStrike -- legality gate, siege damage, sack-equivalent gold loss, arsenal spend"
```

---

### Task 3: Fallout devastation (§8)

**Files:**
- Modify: `src/systems/strategic-strike-system.ts`
- Modify: `tests/systems/strategic-strike-system.test.ts`

**Interfaces:**
- Consumes: `mapHexesInRange(map, center, range): HexCoord[]`, `hexKey(coord): string`
  (`hex-utils.ts`, unchanged); `resolvePressureSeverityForCiv(state, civId):
  OpponentChallenge` (`opponent-challenge.ts`, unchanged).
- Produces: extends `StrategicStrikeResult`'s `ok: true` branch with
  `devastatedTileKeys: string[]` — the full list of tile keys this strike marked
  `devastatedUntilTurn`.

- [x] **Step 1: Write the failing tests**

Append to `tests/systems/strategic-strike-system.test.ts`:

```typescript
describe('resolveStrategicStrike fallout (#545 MR3 §8)', () => {
  it('devastates the defender\'s owned tiles within blast radius 3, using standard devastationTurns (14)', () => {
    const state = makeStrikeState();
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);

    const withinRadius3 = hexesInRange(TARGET_POS, 3).map(hexKey);
    expect(result.devastatedTileKeys.sort()).toEqual(withinRadius3.sort());
    for (const key of withinRadius3) {
      expect(result.state.map.tiles[key].devastatedUntilTurn).toBe(state.turn + 14);
    }
  });

  it('does not devastate tiles beyond blast radius 3 (boundary check)', () => {
    const state = makeStrikeState();
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);

    const beyondRadius3 = hexesInRange(TARGET_POS, 4)
      .map(hexKey)
      .filter(key => !hexesInRange(TARGET_POS, 3).map(hexKey).includes(key));
    expect(beyondRadius3.length).toBeGreaterThan(0);
    for (const key of beyondRadius3) {
      expect(result.state.map.tiles[key].devastatedUntilTurn).toBeUndefined();
    }
  });

  it('never devastates a tile owned by another civ or unowned land, even within blast radius', () => {
    const enemyTilePos = hexesInRange(TARGET_POS, 2)[0]!;
    const state = makeStrikeState({
      map: {
        width: 60, height: 60, wrapsHorizontally: false, rivers: [],
        tiles: (() => {
          const base = makeStrikeState().map.tiles;
          const key = hexKey(enemyTilePos);
          return { ...base, [key]: { ...base[key]!, owner: 'someone-else' } };
        })(),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.devastatedTileKeys).not.toContain(hexKey(enemyTilePos));
    expect(result.state.map.tiles[hexKey(enemyTilePos)].devastatedUntilTurn).toBeUndefined();
  });

  it('applies fallout unconditionally on a legal strike, even when a garrison blocks HP/gold effects', () => {
    const state = makeStrikeState({
      units: { garrison: { id: 'garrison', type: 'warrior', owner: 'defender', position: TARGET_POS } as any },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.cityResult.outcome).toBe('blocked');
    expect(result.devastatedTileKeys.length).toBeGreaterThan(0);
    expect(result.state.map.tiles[hexKey(TARGET_POS)].devastatedUntilTurn).toBe(state.turn + 14);
  });

  it('resolves devastation turns from the defending civ\'s own challenge, not the attacker\'s', () => {
    const state = makeStrikeState({
      civilizations: {
        ...makeStrikeState().civilizations,
        defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar, isHuman: true, challenge: 'veteran' as any }),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.map.tiles[hexKey(TARGET_POS)].devastatedUntilTurn).toBe(state.turn + 18); // veteran
  });

  it('devastates nothing when the defending civ owns no tile in blast radius (mirrors crisis-system.ts\'s identical epicenter-ownership edge case)', () => {
    const base = makeStrikeState();
    const tiles = Object.fromEntries(
      Object.entries(base.map.tiles).map(([key, tile]) => [key, tile.owner === 'defender' ? { ...tile, owner: null } : tile]),
    );
    const state = makeStrikeState({ map: { ...base.map, tiles } });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.devastatedTileKeys).toEqual([]);
    expect(result.state.map.tiles[hexKey(TARGET_POS)].devastatedUntilTurn).toBeUndefined();
  });

  it('does not mutate the input state\'s map tiles on a successful strike', () => {
    const state = makeStrikeState();
    resolveStrategicStrike(state, 'attacker', 'target');
    expect(state.map.tiles[hexKey(TARGET_POS)].devastatedUntilTurn).toBeUndefined();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-strike-system -t fallout`
Expected: FAIL — `result.devastatedTileKeys` is `undefined` (property does not exist
on the current `ok: true` result).

- [x] **Step 3: Implement**

In `src/systems/strategic-strike-system.ts`:

Add to the imports:

```typescript
import type { GameState, HexCoord, OpponentChallenge } from '@/core/types';
import { hexKey, mapHexesInRange } from '@/systems/hex-utils';
import { resolveChallengeForCiv, resolvePressureSeverityForCiv } from '@/core/opponent-challenge';
```

(This replaces the earlier `import type { GameState } from '@/core/types';` and
`import { resolveChallengeForCiv } from '@/core/opponent-challenge';` lines from
Task 2 — merge into one `@/core/types` import and one `@/core/opponent-challenge`
import, don't leave duplicates.)

Add the two new constants near `STRATEGIC_STRIKE_RAW_DAMAGE`:

```typescript
// #545 spec §8: "one more than catastrophe's worst tier of 2" and "roughly 1.8x
// catastrophe's 4/8/10 -- reflecting deliberate-act severity over natural-disaster
// severity." Spec-locked exact values, distinct from crisis-flavor-definitions.ts's
// own catastrophe table.
const STRIKE_BLAST_RADIUS = 3;
const STRIKE_DEVASTATION_TURNS_BY_CHALLENGE: Record<OpponentChallenge, number> = {
  explorer: 8,
  standard: 14,
  veteran: 18,
};
```

Add the new private helper (after `resolveStrategicStrike`, or anywhere below it):

```typescript
// #545 spec §8: mirrors crisis-system.ts's applyCatastropheShock in spirit (same
// devastatedUntilTurn primitive, same ownership guard, same
// resolvePressureSeverityForCiv-driven turn count) but is simpler -- a strike's
// blast center is the struck city's own fixed position, not a randomly chosen
// epicenter within a candidate list, so every owned tile in radius is devastated
// deterministically and no RNG is needed anywhere in this module.
function applyStrategicFallout(
  state: GameState,
  epicenter: HexCoord,
  defendingCivId: string,
): { state: GameState; affectedKeys: string[] } {
  const affectedKeys = mapHexesInRange(state.map, epicenter, STRIKE_BLAST_RADIUS)
    .map(hexKey)
    .filter(key => state.map.tiles[key]?.owner === defendingCivId);
  if (affectedKeys.length === 0) return { state, affectedKeys };

  const devastationTurns = STRIKE_DEVASTATION_TURNS_BY_CHALLENGE[resolvePressureSeverityForCiv(state, defendingCivId)];
  const devastatedUntilTurn = state.turn + devastationTurns;

  const tiles = { ...state.map.tiles };
  for (const key of affectedKeys) {
    tiles[key] = { ...tiles[key]!, devastatedUntilTurn };
  }

  return { state: { ...state, map: { ...state.map, tiles } }, affectedKeys };
}
```

Update the `StrategicStrikeResult` `ok: true` branch to add the new field:

```typescript
export type StrategicStrikeResult =
  | {
    ok: true;
    state: GameState;
    platform: StrategicLaunchPlatform;
    cityResult: CitySiegeResult;
    goldLost: number;
    /** Every tile key this strike marked devastatedUntilTurn (#545 spec §8). Empty
     * when the defending civ owned no tile within blast radius (shouldn't happen in
     * practice -- the target city's own tile is always owned by its civ -- but never
     * silently omitted). */
    devastatedTileKeys: string[];
  }
  | { ok: false; reason: StrategicStrikeFailure };
```

Update `resolveStrategicStrike`'s body: replace the final two lines
(`nextState = spendStrategicArsenal(...)` through the `return`) with:

```typescript
  const fallout = applyStrategicFallout(nextState, targetCity.position, targetCiv.id);
  nextState = fallout.state;

  nextState = spendStrategicArsenal(nextState, actorCivId);

  return {
    ok: true,
    state: nextState,
    platform: legality.platform,
    cityResult,
    goldLost,
    devastatedTileKeys: fallout.affectedKeys,
  };
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-strike-system`
Expected: PASS — all tests in the file, including Task 2's (the new field is
additive; Task 2's tests don't assert on `devastatedTileKeys` so they stay green).

- [x] **Step 5: Commit**

```bash
git add src/systems/strategic-strike-system.ts tests/systems/strategic-strike-system.test.ts
git commit -m "feat(#545): add strategic-strike fallout devastation (blast radius 3, challenge-scaled)"
```

---

### Task 4: Determinism confirmation + full-suite verification

**Files:** none (verification only).

- [x] **Step 1: Confirm zero RNG in the new module**

Run: `grep -n "Math.random\|seededLcg\|createSeededRng" src/systems/strategic-strike-system.ts`
Expected: no matches — confirms the Architecture note's claim that this module needs
no randomness (blast center is the struck city's fixed position, not a randomly
chosen epicenter).

- [x] **Step 2: Confirm determinism empirically (repeated-call test)**

Add to `tests/systems/strategic-strike-system.test.ts`, in the top-level
`describe('resolveStrategicStrike (#545 MR3 §7)', ...)` block:

```typescript
  it('is deterministic -- identical input produces an identical result', () => {
    const state = makeStrikeState();
    const first = resolveStrategicStrike(state, 'attacker', 'target');
    const second = resolveStrategicStrike(state, 'attacker', 'target');
    expect(first).toEqual(second);
  });
```

Run: `bash scripts/run-with-mise.sh yarn test strategic-strike-system`
Expected: PASS.

- [x] **Step 3: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests pass, including hook smoke tests.

- [x] **Step 4: Run the production build (includes typecheck)**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: succeeds, no TypeScript errors.

- [x] **Step 5: Confirm architecture boundaries (manual check)**

Run: `grep -n "^import" src/systems/strategic-strike-system.ts`
Expected: every import line targets `@/core/types`, `@/systems/*`, or
`@/core/opponent-challenge` — none from `@/ui/`, `@/renderer/`, or `@/ai/`.

- [x] **Step 6: Confirm zero pacing regression**

Run: `bash scripts/run-with-mise.sh yarn test pacing-audit pacing-reference-economy`
Expected: PASS with no snapshot diff — this MR adds no new building, unit, yield, or
production item; `strategic-strike-system.ts` is a pure state-transform with no
economy footprint.

- [x] **Step 7: Commit (only if any step above required a fix)**

```bash
git add tests/systems/strategic-strike-system.test.ts
git commit -m "test(#545): lock strategic-strike determinism"
```

If no fix was required beyond the determinism test itself, that's the only thing to
commit here — don't create an empty "verification" commit.

---

## Definition of Done

- [x] `spendStrategicArsenal(state, civId)` exists in `strategic-arsenal-system.ts`,
  decrements by 1, floors at 0, immutable, no-op for an unknown civ.
- [x] `city-siege-system.ts`'s `SACK_GOLD_LOSS_FRACTION` is exported; no other change
  to that file or to `naval-city-bombardment-system.ts`'s behavior.
- [x] `resolveStrategicStrike(state, actorCivId, targetCityId)` exists in the new
  `src/systems/strategic-strike-system.ts`:
  - Gates exclusively through `getStrategicLaunchLegality` (MR2) — all five legality
    reasons (`unknown-target-city`, `no-arsenal`, `target-not-discovered`,
    `not-at-war`, `no-eligible-platform`) propagate through unchanged, each covered
    by its own test.
  - Applies city damage exclusively through `resolveCitySiegeDamage`/
    `applyCitySiegeOutcome` with `attackerDomain: 'air'`, `preventDestruction: true`
    forced regardless of era/last-city status — never destroys the target city.
  - Applies the sack-equivalent gold-loss consequence (the plan header's documented,
    deliberate deviation from the spec's literal "no change needed" claim) — 0 when a
    garrison blocks the strike, `round(gold * 0.15)` otherwise.
  - Spends exactly one warhead via `spendStrategicArsenal` on every legal strike.
  - Devastates the defending civ's own owned tiles within blast radius 3 via the
    existing `devastatedUntilTurn` primitive, challenge-scaled
    (`explorer: 8, standard: 14, veteran: 18` turns) via
    `resolvePressureSeverityForCiv`, unconditional on garrison-blocked HP/gold
    effects, never touching another civ's or unowned tiles.
  - Needs zero RNG anywhere — confirmed by grep and a determinism regression test.
  - Never mutates the caller's input `state` (all four mutated slices — city HP,
    defender gold, actor arsenal, map tiles — each covered by an explicit
    non-mutation test), and produces an empty `devastatedTileKeys: []` rather than
    throwing or silently omitting the field when the defending civ owns no tile in
    blast radius (mirrors `crisis-system.ts`'s identical epicenter-ownership edge
    case).
- [x] `bash scripts/run-with-mise.sh yarn test` passes (full suite).
- [x] `bash scripts/run-with-mise.sh yarn build` passes (typecheck + production build).
- [x] Zero player-facing surface introduced — `resolveStrategicStrike` has no caller
  anywhere outside its own test file; the incremental-delivery decision above states
  this explicitly, per `.claude/rules/incremental-mr-completion.md`.
- [x] PR body states "Part of #545" (never "Closes #545") and calls out the §7
  gold-loss spec-vs-code discrepancy explicitly, per `.claude/rules/spec-fidelity.md`.
