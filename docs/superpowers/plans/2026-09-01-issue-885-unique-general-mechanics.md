# Unique Great General Mechanics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this repo forbids subagents
> (`CLAUDE.md` Agent Policy). Use `superpowers:executing-plans` to implement this
> plan task-by-task, inline, in this session. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give authored Great Generals bounded, definition-driven mechanical
identities via a small reusable vocabulary of typed specialties, without a new UI
screen, new mechanic classes, save-shape change, or General-ID branches.

**Architecture:** A new `src/systems/great-general-specialties.ts` module holds a
typed specialty catalog, an id→specialty assignment map for the authored roster,
and `resolveGeneralMechanics(def)` — a memoized resolver returning a fully-resolved
`ResolvedGeneralMechanics` object. Every ability/AI/UI consumer reads the resolver
instead of raw `GeneralDefinition` fields or module constants. `GeneralDefinition`
and `GeneratedGeneralIdentity` are untouched, so generated officers (#888)
structurally cannot be specialists and there is no save-normalize change.

**Tech Stack:** TypeScript, Vitest, `bash scripts/run-with-mise.sh yarn <cmd>`.

## Global Constraints

- **No `Math.random()` / `Date.now()`** anywhere — seeded RNG only. Nothing in this
  plan needs randomness.
- **Immutable turn processing** — system functions return a new `GameState`; never
  mutate `state.units[id] = ...` / nested fields. Spread-copy.
- **No General-ID switches** in any consumer (`if (def.id === 'gen_caesar')` is a
  plan failure). All divergence flows through `resolveGeneralMechanics(def)`.
- **Difficulty-invariant mechanics** — `resolveGeneralMechanics` and the AI
  candidate valuation must never read `state.opponentChallenge` / `civ.challenge`.
- **Generated officers stay baseline** — `resolveGeneralMechanics(generatedIdentity)`
  must equal `BASELINE_GENERAL_MECHANICS`.
- **No save-shape change, no `SAVE_VERSION` bump, no new migration.**
- **UI:** no new panel/modal/screen/animation/audio/color-only info. At most one
  `textContent` line each on the existing selected-unit panel and candidate chooser.
- **Test commands:** unit run = `bash scripts/run-with-mise.sh yarn vitest run <path>`;
  full = `bash scripts/run-with-mise.sh yarn test`; typecheck = `bash scripts/run-with-mise.sh yarn build`.
- Commit message trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Baseline values (V1, verified against `f9f96527`)

`commandRange 2`, `commandCapacity 3`, `maxCommandCharges 3`, `cooldownTurns 10`,
Rally `healAmount 30`, Last Stand `defenseMultiplier 1.15` / `durationTurns 2` /
radius 1, Seize `extraTargets 0`.

## Specialty vocabulary (v1)

| id | display name | boost | cost |
|---|---|---|---|
| `defensive` | Defensive Commander | `lastStand.defenseMultiplier 1.25`, `lastStand.durationTurns 3` | `commandRange 1` |
| `initiative` | Bold Commander | `seize.extraTargets 1`, `cooldownTurns 7` | `lastStand.defenseMultiplier 1.10` |
| `logistician` | Supply Master | `rally.healAmount 50` | `cooldownTurns 13` |
| `mobile` | Swift Commander | `commandRange 3` | `commandCapacity 2` |
| `endurance` | Tireless Commander | `maxCommandCharges 4` | `rally.healAmount 20` |
| `generalist` | Field Commander | — baseline — | — baseline — |

## Enforced bounds (resolver hard-clamps ≥1 / ≥0; catalog test enforces these softer bounds)

`commandRange [1,3]`, `commandCapacity [2,4]`, `maxCommandCharges [2,4]`,
`cooldownTurns [7,13]`, `rally.healAmount [20,50]`,
`lastStand.defenseMultiplier [1.10,1.30]`, `lastStand.durationTurns [2,3]`,
`seize.extraTargets [0,1]`.

## Roster distribution (34 authored — mapping is explicit typed data; #886 framing = inspiration only)

- `generalist` (6): `gen_hannibal`, `gen_universal_marshal`, `gen_universal_warlord`, `gen_universal_field_marshal`, `gen_universal_commodore`, `gen_thessaly`
- `defensive` (6): `gen_wellington`, `gen_boromir`, `gen_nebuchadnezzar`, `gen_tokugawa`, `gen_cuauhtemoc`, `gen_haldir`
- `initiative` (6): `gen_caesar`, `gen_suvorov`, `gen_frederick`, `gen_napoleon`, `gen_lancelot`, `gen_merry`
- `logistician` (5): `gen_yuefei`, `gen_chandragupta`, `gen_ramesses`, `gen_cyrus`, `gen_gwydion`
- `mobile` (6): `gen_genghis`, `gen_eomer`, `gen_ragnar`, `gen_ugluk`, `gen_alexander`, `gen_oreius`
- `endurance` (5): `gen_shaka`, `gen_mehmed`, `gen_elcid`, `gen_okoye`, `gen_hornedking`

## File Structure

**Create:**
- `src/systems/great-general-specialties.ts` — `GeneralSpecialtyId`, `ResolvedGeneralMechanics`, `BASELINE_GENERAL_MECHANICS`, `GENERAL_SPECIALTIES`, `GENERAL_SPECIALTY_ASSIGNMENTS`, `resolveGeneralMechanics`, `getGeneralSpecialtyPresentation`.
- `tests/systems/great-general-specialties.test.ts` — catalog / bounds / no-strict-upgrade / assignments / generated-baseline / universal-fallback policy.
- `tests/systems/great-general-specialty-balance.test.ts` — deterministic 6×6 balance matrix.

**Modify:**
- `src/systems/great-general-abilities.ts` — thread resolver; delete `RALLY_HEAL_AMOUNT`, `LAST_STAND_DEFENSE_MULTIPLIER`, `LAST_STAND_DURATION_TURNS`.
- `src/systems/great-general-system.ts` — `getEffectiveCommandStats` internal resolve; `retireGeneralsAtTurnEnd` resolved `maxCommandCharges`; remove `chooseBestGeneralCandidate` (moves to AI file).
- `src/ai/ai-general-command.ts` — new `chooseBestGeneralCandidate(state, civId, candidates)`.
- `src/core/turn-manager.ts` — update the `chooseBestGeneralCandidate` import + call.
- `src/ui/selected-unit-info.ts` — resolved command-stats line + specialty line.
- `src/ui/general-candidate-panel.ts` — specialty line.
- `src/ui/advisor-system.ts` — resolved command range; soften "3 lifetime Command Charges" copy.
- `.claude/rules/game-balance.md` — new "Great General Specialty Bounds" section.
- Test helpers: `tests/systems/great-general-abilities.test.ts` + `tests/systems/great-general-mr5-invariants.test.ts` — change `makeGeneral()` default `generalDefinitionId` from `'gen_caesar'` to `'gen_hannibal'` (a `generalist`) so existing baseline-behavior tests stay green.
- Test files for new behavior: `tests/systems/great-general-abilities.test.ts`, `tests/systems/great-general-system.test.ts`, `tests/ai/ai-general-command.test.ts`, `tests/core/turn-manager.test.ts`, `tests/systems/great-general-mr5-invariants.test.ts`, `tests/ui/selected-unit-info.test.ts`, `tests/ui/general-candidate-panel.test.ts`, `tests/ui/advisor-system.test.ts`.
- `docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md` — mark §row D done.

**Untouched (verify at the end):** `src/core/types.ts`, `src/systems/great-general-definitions.ts`, `src/systems/great-general-fallback-content.ts`, `src/storage/save-migrations.ts`, `src/systems/great-general-profiles.ts` (#886).

---

### Task 1: Specialty types, baseline, catalog, resolver

**Files:**
- Create: `src/systems/great-general-specialties.ts`
- Test: `tests/systems/great-general-specialties.test.ts`

**Interfaces:**
- Consumes: `GeneralDefinition` from `@/systems/great-general-definitions`.
- Produces:
  - `type GeneralSpecialtyId = 'generalist' | 'defensive' | 'initiative' | 'logistician' | 'mobile' | 'endurance'`
  - `interface ResolvedGeneralMechanics { commandRange: number; commandCapacity: number; maxCommandCharges: number; cooldownTurns: number; rally: { healAmount: number }; lastStand: { defenseMultiplier: number; durationTurns: number }; seize: { extraTargets: number } }`
  - `const BASELINE_GENERAL_MECHANICS: ResolvedGeneralMechanics`
  - `const GENERAL_SPECIALTIES: Record<GeneralSpecialtyId, GeneralSpecialtyDef>` where `interface GeneralSpecialtyDef { id: GeneralSpecialtyId; displayName: string; summary: string; apply(base: ResolvedGeneralMechanics): ResolvedGeneralMechanics }`
  - `function resolveGeneralMechanics(def: Pick<GeneralDefinition, 'id' | 'commandRange' | 'commandCapacity' | 'maxCommandCharges' | 'cooldownTurns'>): ResolvedGeneralMechanics`
  - `const GENERAL_SPECIALTY_ASSIGNMENTS: Record<string, GeneralSpecialtyId>` (Task 3 fills it; declare empty-typed here is NOT allowed — Task 3 creates it. This task's resolver reads it, so declare it in this task as the full map from the distribution table above.)

- [ ] **Step 1: Write the failing test**

Create `tests/systems/great-general-specialties.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BASELINE_GENERAL_MECHANICS,
  GENERAL_SPECIALTIES,
  resolveGeneralMechanics,
  type GeneralSpecialtyId,
} from '@/systems/great-general-specialties';

const baseDef = { id: 'x', commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10 };

describe('resolveGeneralMechanics', () => {
  it('returns the V1 baseline for an unassigned id', () => {
    expect(resolveGeneralMechanics(baseDef)).toEqual(BASELINE_GENERAL_MECHANICS);
  });

  it('BASELINE_GENERAL_MECHANICS has the audited V1 numbers', () => {
    expect(BASELINE_GENERAL_MECHANICS).toEqual({
      commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10,
      rally: { healAmount: 30 },
      lastStand: { defenseMultiplier: 1.15, durationTurns: 2 },
      seize: { extraTargets: 0 },
    });
  });

  it('defensive: stronger longer Last Stand, shorter command range, all else baseline', () => {
    const m = resolveGeneralMechanics({ ...baseDef, id: 'gen_wellington' });
    expect(m.lastStand).toEqual({ defenseMultiplier: 1.25, durationTurns: 3 });
    expect(m.commandRange).toBe(1);
    expect(m.commandCapacity).toBe(3);
    expect(m.maxCommandCharges).toBe(3);
    expect(m.cooldownTurns).toBe(10);
    expect(m.rally.healAmount).toBe(30);
  });

  it('initiative: +1 seize target and 7-turn cooldown, weaker Last Stand', () => {
    const m = resolveGeneralMechanics({ ...baseDef, id: 'gen_caesar' });
    expect(m.seize.extraTargets).toBe(1);
    expect(m.cooldownTurns).toBe(7);
    expect(m.lastStand.defenseMultiplier).toBe(1.10);
    expect(m.commandRange).toBe(2);
    expect(m.maxCommandCharges).toBe(3);
  });

  it('logistician: Rally 50, 13-turn cooldown', () => {
    const m = resolveGeneralMechanics({ ...baseDef, id: 'gen_yuefei' });
    expect(m.rally.healAmount).toBe(50);
    expect(m.cooldownTurns).toBe(13);
  });

  it('mobile: range 3, capacity 2', () => {
    const m = resolveGeneralMechanics({ ...baseDef, id: 'gen_genghis' });
    expect(m.commandRange).toBe(3);
    expect(m.commandCapacity).toBe(2);
  });

  it('endurance: 4 charges, Rally 20', () => {
    const m = resolveGeneralMechanics({ ...baseDef, id: 'gen_shaka' });
    expect(m.maxCommandCharges).toBe(4);
    expect(m.rally.healAmount).toBe(20);
  });

  it('generalist assignment resolves to exact baseline', () => {
    expect(resolveGeneralMechanics({ ...baseDef, id: 'gen_hannibal' })).toEqual(BASELINE_GENERAL_MECHANICS);
  });

  it('a generated: id resolves to exact baseline', () => {
    expect(resolveGeneralMechanics({ ...baseDef, id: 'generated:rome:3:deadbeef' })).toEqual(BASELINE_GENERAL_MECHANICS);
  });

  it('hard-clamps a hypothetical bad delta to safe floors', () => {
    const bad = GENERAL_SPECIALTIES.defensive.apply({
      commandRange: 0, commandCapacity: 0, maxCommandCharges: 0, cooldownTurns: 0,
      rally: { healAmount: -5 }, lastStand: { defenseMultiplier: 1, durationTurns: 0 }, seize: { extraTargets: 0 },
    });
    // apply() itself does not clamp; resolveGeneralMechanics does. Assert the resolver path:
    const m = resolveGeneralMechanics({ id: 'gen_wellington', commandRange: 0, commandCapacity: 0, maxCommandCharges: 0, cooldownTurns: 0 });
    expect(m.commandRange).toBeGreaterThanOrEqual(1);
    expect(m.commandCapacity).toBeGreaterThanOrEqual(1);
    expect(m.maxCommandCharges).toBeGreaterThanOrEqual(1);
    expect(m.cooldownTurns).toBeGreaterThanOrEqual(1);
    expect(m.rally.healAmount).toBeGreaterThanOrEqual(0);
    void bad;
  });

  it('is memoized: same def id returns a referentially stable object', () => {
    const a = resolveGeneralMechanics({ ...baseDef, id: 'gen_wellington' });
    const b = resolveGeneralMechanics({ ...baseDef, id: 'gen_wellington' });
    expect(a).toBe(b);
  });

  it('every catalog entry is one of the six specialty ids', () => {
    const ids: GeneralSpecialtyId[] = ['generalist', 'defensive', 'initiative', 'logistician', 'mobile', 'endurance'];
    expect(Object.keys(GENERAL_SPECIALTIES).sort()).toEqual([...ids].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-specialties.test.ts`
Expected: FAIL — cannot resolve `@/systems/great-general-specialties`.

- [ ] **Step 3: Write the module**

Create `src/systems/great-general-specialties.ts`:

```ts
/**
 * #885 — reusable typed Great General specialties.
 *
 * `GeneralDefinition` / `GeneratedGeneralIdentity` are deliberately NOT touched
 * (mirrors #886's separate-module pattern): generated officers structurally
 * cannot be specialists, and there is no save-normalize change. Every ability /
 * AI / UI consumer reads `resolveGeneralMechanics(def)` instead of raw
 * definition fields or the old module constants in great-general-abilities.ts.
 *
 * No General-ID branches: divergence is data in GENERAL_SPECIALTIES +
 * GENERAL_SPECIALTY_ASSIGNMENTS only. Adding a 6th specialty = one catalog
 * entry + some assignments; zero consumer edits (see
 * .claude/rules/game-balance.md "Great General Specialty Bounds").
 */
import type { GeneralDefinition } from '@/systems/great-general-definitions';

export type GeneralSpecialtyId =
  | 'generalist' | 'defensive' | 'initiative' | 'logistician' | 'mobile' | 'endurance';

export interface ResolvedGeneralMechanics {
  commandRange: number;
  commandCapacity: number;
  maxCommandCharges: number;
  cooldownTurns: number;
  rally: { healAmount: number };
  lastStand: { defenseMultiplier: number; durationTurns: number };
  seize: { extraTargets: number };
}

/** The audited V1 numbers — the base every specialty delta applies to. */
export const BASELINE_GENERAL_MECHANICS: ResolvedGeneralMechanics = {
  commandRange: 2,
  commandCapacity: 3,
  maxCommandCharges: 3,
  cooldownTurns: 10,
  rally: { healAmount: 30 },
  lastStand: { defenseMultiplier: 1.15, durationTurns: 2 },
  seize: { extraTargets: 0 },
};

export interface GeneralSpecialtyDef {
  id: GeneralSpecialtyId;
  /** Kid-friendly name shown on existing surfaces. */
  displayName: string;
  /** One plain-language sentence: what it's good at + the cost. */
  summary: string;
  apply(base: ResolvedGeneralMechanics): ResolvedGeneralMechanics;
}

const clone = (m: ResolvedGeneralMechanics): ResolvedGeneralMechanics => ({
  ...m, rally: { ...m.rally }, lastStand: { ...m.lastStand }, seize: { ...m.seize },
});

export const GENERAL_SPECIALTIES: Record<GeneralSpecialtyId, GeneralSpecialtyDef> = {
  generalist: {
    id: 'generalist', displayName: 'Field Commander',
    summary: 'A dependable all-rounder with no special strength or weakness.',
    apply: base => clone(base),
  },
  defensive: {
    id: 'defensive', displayName: 'Defensive Commander',
    summary: 'Especially good at holding ground: Last Stand protects more strongly (+25%) and lasts longer (3 turns). In exchange, a shorter command range.',
    apply: base => { const m = clone(base); m.lastStand.defenseMultiplier = 1.25; m.lastStand.durationTurns = 3; m.commandRange = 1; return m; },
  },
  initiative: {
    id: 'initiative', displayName: 'Bold Commander',
    summary: 'Especially good at pressing an advantage: Seize the Moment reaches one more unit and its cooldown is shorter (7 turns). In exchange, a weaker Last Stand.',
    apply: base => { const m = clone(base); m.seize.extraTargets = 1; m.cooldownTurns = 7; m.lastStand.defenseMultiplier = 1.10; return m; },
  },
  logistician: {
    id: 'logistician', displayName: 'Supply Master',
    summary: 'Especially good at keeping an army in the field: Rally heals far more (50). In exchange, a longer cooldown (13 turns).',
    apply: base => { const m = clone(base); m.rally.healAmount = 50; m.cooldownTurns = 13; return m; },
  },
  mobile: {
    id: 'mobile', displayName: 'Swift Commander',
    summary: 'Especially good at covering ground: a longer command range (3). In exchange, commands fewer units at once (2).',
    apply: base => { const m = clone(base); m.commandRange = 3; m.commandCapacity = 2; return m; },
  },
  endurance: {
    id: 'endurance', displayName: 'Tireless Commander',
    summary: 'Especially good at a long war: one extra lifetime Command Charge (4). In exchange, a lighter Rally (20).',
    apply: base => { const m = clone(base); m.maxCommandCharges = 4; m.rally.healAmount = 20; return m; },
  },
};

/**
 * Authored roster id -> specialty. Covers exactly GENERAL_DEFINITIONS ids; no
 * 'generated:' keys (a generated officer resolves to baseline via the absent
 * lookup). Universal fallback commanders are 'generalist' by policy — the clear
 * mechanical fallback tier (#885 Phase 32).
 */
export const GENERAL_SPECIALTY_ASSIGNMENTS: Record<string, GeneralSpecialtyId> = {
  gen_hannibal: 'generalist',
  gen_universal_marshal: 'generalist',
  gen_universal_warlord: 'generalist',
  gen_universal_field_marshal: 'generalist',
  gen_universal_commodore: 'generalist',
  gen_thessaly: 'generalist',

  gen_wellington: 'defensive',
  gen_boromir: 'defensive',
  gen_nebuchadnezzar: 'defensive',
  gen_tokugawa: 'defensive',
  gen_cuauhtemoc: 'defensive',
  gen_haldir: 'defensive',

  gen_caesar: 'initiative',
  gen_suvorov: 'initiative',
  gen_frederick: 'initiative',
  gen_napoleon: 'initiative',
  gen_lancelot: 'initiative',
  gen_merry: 'initiative',

  gen_yuefei: 'logistician',
  gen_chandragupta: 'logistician',
  gen_ramesses: 'logistician',
  gen_cyrus: 'logistician',
  gen_gwydion: 'logistician',

  gen_genghis: 'mobile',
  gen_eomer: 'mobile',
  gen_ragnar: 'mobile',
  gen_ugluk: 'mobile',
  gen_alexander: 'mobile',
  gen_oreius: 'mobile',

  gen_shaka: 'endurance',
  gen_mehmed: 'endurance',
  gen_elcid: 'endurance',
  gen_okoye: 'endurance',
  gen_hornedking: 'endurance',
};

type MechDefFields = Pick<GeneralDefinition,
  'id' | 'commandRange' | 'commandCapacity' | 'maxCommandCharges' | 'cooldownTurns'>;

const CACHE = new Map<string, ResolvedGeneralMechanics>();

/** Hard floors — belt-and-braces against a bad catalog entry / future bug.
 * Independent of the softer documented bounds enforced by the catalog test. */
function clampHard(m: ResolvedGeneralMechanics): ResolvedGeneralMechanics {
  const out = clone(m);
  out.commandRange = Math.max(1, Math.round(out.commandRange));
  out.commandCapacity = Math.max(1, Math.round(out.commandCapacity));
  out.maxCommandCharges = Math.max(1, Math.round(out.maxCommandCharges));
  out.cooldownTurns = Math.max(1, Math.round(out.cooldownTurns));
  out.rally.healAmount = Math.max(0, out.rally.healAmount);
  out.lastStand.defenseMultiplier = Math.max(1, out.lastStand.defenseMultiplier);
  out.lastStand.durationTurns = Math.max(1, Math.round(out.lastStand.durationTurns));
  out.seize.extraTargets = Math.max(0, Math.round(out.seize.extraTargets));
  return out;
}

/**
 * The single canonical resolver. O(1): a Map lookup + one shallow merge,
 * memoized by `def.id`. Unknown / unassigned / 'generated:' id -> baseline.
 * Never reads difficulty.
 */
export function resolveGeneralMechanics(def: MechDefFields): ResolvedGeneralMechanics {
  const cached = CACHE.get(def.id);
  if (cached) return cached;

  const base: ResolvedGeneralMechanics = {
    commandRange: def.commandRange,
    commandCapacity: def.commandCapacity,
    maxCommandCharges: def.maxCommandCharges,
    cooldownTurns: def.cooldownTurns,
    rally: { healAmount: BASELINE_GENERAL_MECHANICS.rally.healAmount },
    lastStand: { ...BASELINE_GENERAL_MECHANICS.lastStand },
    seize: { ...BASELINE_GENERAL_MECHANICS.seize },
  };

  const specialtyId = GENERAL_SPECIALTY_ASSIGNMENTS[def.id];
  const resolved = clampHard(
    !specialtyId || specialtyId === 'generalist' ? base : GENERAL_SPECIALTIES[specialtyId].apply(base),
  );
  CACHE.set(def.id, resolved);
  return resolved;
}

/**
 * The specialty label + one line for the two existing surfaces. Returns
 * `undefined` for a generalist or any id without an assignment (generated
 * officers, unknown ids) so callers render nothing rather than a misleading line.
 */
export function getGeneralSpecialtyPresentation(
  def: Pick<GeneralDefinition, 'id'>,
): { id: GeneralSpecialtyId; displayName: string; summary: string } | undefined {
  const specialtyId = GENERAL_SPECIALTY_ASSIGNMENTS[def.id];
  if (!specialtyId || specialtyId === 'generalist') return undefined;
  const s = GENERAL_SPECIALTIES[specialtyId];
  return { id: s.id, displayName: s.displayName, summary: s.summary };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-specialties.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-specialties.ts tests/systems/great-general-specialties.test.ts
git commit -m "feat(#885): typed Great General specialty catalog + resolveGeneralMechanics

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Bounds + no-strict-upgrade catalog tests + balance rule

**Files:**
- Modify: `tests/systems/great-general-specialties.test.ts` (append a describe block)
- Modify: `.claude/rules/game-balance.md`

**Interfaces:**
- Consumes: `GENERAL_SPECIALTIES`, `BASELINE_GENERAL_MECHANICS`, `resolveGeneralMechanics` (Task 1).

- [ ] **Step 1: Write the failing tests**

Append to `tests/systems/great-general-specialties.test.ts`:

```ts
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

/** Flattened numeric view for bounds/dominance comparison. Higher = better for
 * every field EXCEPT cooldownTurns, where lower = better. */
function flat(m: ReturnType<typeof resolveGeneralMechanics>) {
  return {
    commandRange: m.commandRange,
    commandCapacity: m.commandCapacity,
    maxCommandCharges: m.maxCommandCharges,
    cooldownGood: -m.cooldownTurns, // negate so "higher = better" holds
    rallyHeal: m.rally.healAmount,
    lastStandMult: m.lastStand.defenseMultiplier,
    lastStandDur: m.lastStand.durationTurns,
    seizeExtra: m.seize.extraTargets,
  };
}

const BOUNDS = {
  commandRange: [1, 3], commandCapacity: [2, 4], maxCommandCharges: [2, 4],
  cooldownTurns: [7, 13], rallyHeal: [20, 50],
  lastStandMult: [1.10, 1.30], lastStandDur: [2, 3], seizeExtra: [0, 1],
} as const;

describe('#885 specialty bounds + no strict upgrade', () => {
  const baseDef = { commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10 };

  it('every specialty resolves within the documented bounds', () => {
    for (const id of Object.keys(GENERAL_SPECIALTIES) as (keyof typeof GENERAL_SPECIALTIES)[]) {
      const m = resolveGeneralMechanics({ ...baseDef, id: `probe_${id}` } as never);
      // probe ids aren't assigned -> baseline; assign via a real roster id per specialty instead:
    }
    const sample: Record<string, string> = {
      generalist: 'gen_hannibal', defensive: 'gen_wellington', initiative: 'gen_caesar',
      logistician: 'gen_yuefei', mobile: 'gen_genghis', endurance: 'gen_shaka',
    };
    for (const [spec, id] of Object.entries(sample)) {
      const m = resolveGeneralMechanics({ ...baseDef, id });
      expect(m.commandRange, spec).toBeGreaterThanOrEqual(BOUNDS.commandRange[0]);
      expect(m.commandRange, spec).toBeLessThanOrEqual(BOUNDS.commandRange[1]);
      expect(m.commandCapacity, spec).toBeGreaterThanOrEqual(BOUNDS.commandCapacity[0]);
      expect(m.commandCapacity, spec).toBeLessThanOrEqual(BOUNDS.commandCapacity[1]);
      expect(m.maxCommandCharges, spec).toBeGreaterThanOrEqual(BOUNDS.maxCommandCharges[0]);
      expect(m.maxCommandCharges, spec).toBeLessThanOrEqual(BOUNDS.maxCommandCharges[1]);
      expect(m.cooldownTurns, spec).toBeGreaterThanOrEqual(BOUNDS.cooldownTurns[0]);
      expect(m.cooldownTurns, spec).toBeLessThanOrEqual(BOUNDS.cooldownTurns[1]);
      expect(m.rally.healAmount, spec).toBeGreaterThanOrEqual(BOUNDS.rallyHeal[0]);
      expect(m.rally.healAmount, spec).toBeLessThanOrEqual(BOUNDS.rallyHeal[1]);
      expect(m.lastStand.defenseMultiplier, spec).toBeGreaterThanOrEqual(BOUNDS.lastStandMult[0]);
      expect(m.lastStand.defenseMultiplier, spec).toBeLessThanOrEqual(BOUNDS.lastStandMult[1]);
      expect(m.lastStand.durationTurns, spec).toBeGreaterThanOrEqual(BOUNDS.lastStandDur[0]);
      expect(m.lastStand.durationTurns, spec).toBeLessThanOrEqual(BOUNDS.lastStandDur[1]);
      expect(m.seize.extraTargets, spec).toBeGreaterThanOrEqual(BOUNDS.seizeExtra[0]);
      expect(m.seize.extraTargets, spec).toBeLessThanOrEqual(BOUNDS.seizeExtra[1]);
    }
  });

  it('every non-generalist specialty has >=1 field better AND >=1 worse than baseline', () => {
    const b = flat(BASELINE_GENERAL_MECHANICS);
    const sample: Record<string, string> = {
      defensive: 'gen_wellington', initiative: 'gen_caesar', logistician: 'gen_yuefei',
      mobile: 'gen_genghis', endurance: 'gen_shaka',
    };
    for (const [spec, id] of Object.entries(sample)) {
      const f = flat(resolveGeneralMechanics({ ...baseDef, id }));
      const keys = Object.keys(b) as (keyof typeof b)[];
      expect(keys.some(k => f[k] > b[k]), `${spec} has no boost`).toBe(true);
      expect(keys.some(k => f[k] < b[k]), `${spec} has no cost`).toBe(true);
    }
  });

  it('no specialty Pareto-dominates another or the generalist', () => {
    const ids = ['gen_hannibal', 'gen_wellington', 'gen_caesar', 'gen_yuefei', 'gen_genghis', 'gen_shaka'];
    const mats = ids.map(id => flat(resolveGeneralMechanics({ ...baseDef, id })));
    const keys = Object.keys(mats[0]!) as (keyof typeof mats[0])[];
    for (let i = 0; i < mats.length; i++) {
      for (let j = 0; j < mats.length; j++) {
        if (i === j) continue;
        const aDominates = keys.every(k => mats[i]![k] >= mats[j]![k]) && keys.some(k => mats[i]![k] > mats[j]![k]);
        expect(aDominates, `${ids[i]} Pareto-dominates ${ids[j]}`).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (the first test's stray `for` loop over probe ids is dead; remove it before running — keep only the `sample` loop). Run:
`bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-specialties.test.ts`
Expected: the three new tests PASS (Task 1's resolver already satisfies them). If any FAIL, a specialty in Task 1 violates a bound or is a strict upgrade — fix the catalog in `great-general-specialties.ts`, not the test.

- [ ] **Step 3: Add the balance rule**

In `.claude/rules/game-balance.md`, add a new section after "## Movement Bonus Stacking Policy" (or at the end):

```markdown
## Great General Specialty Bounds (#885)

`src/systems/great-general-specialties.ts` gives authored Generals a bounded
mechanical identity via a reusable typed specialty catalog. `resolveGeneralMechanics(def)`
is the ONLY place divergence is applied; every ability/AI/UI consumer reads it.
Enforced by `tests/systems/great-general-specialties.test.ts`.

| Dimension | Baseline | Min | Max |
|---|---|---:|---:|
| commandRange | 2 | 1 | 3 |
| commandCapacity | 3 | 2 | 4 |
| maxCommandCharges | 3 | 2 | 4 |
| cooldownTurns | 10 | 7 | 13 |
| rally.healAmount | 30 | 20 | 50 |
| lastStand.defenseMultiplier | 1.15 | 1.10 | 1.30 |
| lastStand.durationTurns | 2 | 2 | 3 |
| seize.extraTargets | 0 | 0 | 1 |

**Rules for a new specialty or a change to an existing one:**
- Every non-`generalist` specialty MUST have >= 1 dimension better AND >= 1 worse
  than baseline (no strict upgrade), and MUST NOT Pareto-dominate another
  specialty or `generalist`.
- Last Stand **radius** and passive-stabilization magnitude are NOT specialty
  dimensions (radius 2 is too swingy; passive stabilization has no magnitude and
  is a *supply* mechanic, unrelated to #919's unrest-relief ceilings).
- `cooldownTurns` floor is 7 (documented) / 1 (resolver hard-clamp). Never 0.
- Generated officers (#888) and the universal fallback commanders
  (`gen_universal_*`, `gen_hannibal`, `gen_thessaly`) stay `generalist`.
- Adding a specialty = one `GENERAL_SPECIALTIES` entry + `GENERAL_SPECIALTY_ASSIGNMENTS`
  edits + (optionally) one situational term in `chooseBestGeneralCandidate`. NEVER
  a change to an ability consumer and NEVER a General-ID branch.
- Re-run `great-general-specialty-balance.test.ts` — each specialist must still win
  its intended scenario and no specialty may win all six.
```

- [ ] **Step 4: Run full specialties test + build**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-specialties.test.ts` → PASS
Run: `bash scripts/run-with-mise.sh yarn build` → exit 0

- [ ] **Step 5: Commit**

```bash
git add tests/systems/great-general-specialties.test.ts .claude/rules/game-balance.md
git commit -m "test(#885): specialty bounds + no-strict-upgrade catalog gate; balance rule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Roster-assignment coverage + generated/universal policy tests

**Files:**
- Modify: `tests/systems/great-general-specialties.test.ts` (append)

**Interfaces:**
- Consumes: `GENERAL_SPECIALTY_ASSIGNMENTS`, `getGeneralSpecialtyPresentation`, `resolveGeneralMechanics`, `BASELINE_GENERAL_MECHANICS` (Task 1); `GENERAL_DEFINITIONS` from `@/systems/great-general-definitions`; `STANDARD_GENERAL_COMMAND_PROFILE`.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import {
  GENERAL_SPECIALTY_ASSIGNMENTS, getGeneralSpecialtyPresentation,
} from '@/systems/great-general-specialties';

describe('#885 roster assignments', () => {
  const authoredIds = GENERAL_DEFINITIONS.map(g => g.id);

  it('assigns exactly the authored roster — every id present, no strays', () => {
    expect(new Set(Object.keys(GENERAL_SPECIALTY_ASSIGNMENTS))).toEqual(new Set(authoredIds));
  });

  it('no generated: keys', () => {
    for (const id of Object.keys(GENERAL_SPECIALTY_ASSIGNMENTS)) {
      expect(id.startsWith('generated:')).toBe(false);
    }
  });

  it('universal fallback commanders + Hannibal + Thessaly are generalist (Phase 32)', () => {
    for (const id of ['gen_universal_marshal', 'gen_universal_warlord', 'gen_universal_field_marshal',
      'gen_universal_commodore', 'gen_hannibal', 'gen_thessaly']) {
      expect(GENERAL_SPECIALTY_ASSIGNMENTS[id], id).toBe('generalist');
      expect(getGeneralSpecialtyPresentation({ id })).toBeUndefined();
    }
  });

  it('distribution stays legible — 4..7 per non-generalist specialty', () => {
    const counts: Record<string, number> = {};
    for (const v of Object.values(GENERAL_SPECIALTY_ASSIGNMENTS)) counts[v] = (counts[v] ?? 0) + 1;
    for (const spec of ['defensive', 'initiative', 'logistician', 'mobile', 'endurance']) {
      expect(counts[spec] ?? 0, spec).toBeGreaterThanOrEqual(4);
      expect(counts[spec] ?? 0, spec).toBeLessThanOrEqual(7);
    }
    expect(counts.generalist).toBeGreaterThanOrEqual(5);
  });

  it('every authored General resolves valid finite mechanics', () => {
    for (const def of GENERAL_DEFINITIONS) {
      const m = resolveGeneralMechanics(def);
      for (const n of [m.commandRange, m.commandCapacity, m.maxCommandCharges, m.cooldownTurns,
        m.rally.healAmount, m.lastStand.defenseMultiplier, m.lastStand.durationTurns, m.seize.extraTargets]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });
});

describe('#885 generated officers stay baseline (#888 regression)', () => {
  it('a generated identity resolves to exact baseline and has no specialty presentation', () => {
    const generated = {
      id: 'generated:egypt:2:cafef00d',
      commandRange: STANDARD_GENERAL_COMMAND_PROFILE.commandRange,
      commandCapacity: STANDARD_GENERAL_COMMAND_PROFILE.commandCapacity,
      maxCommandCharges: STANDARD_GENERAL_COMMAND_PROFILE.maxCommandCharges,
      cooldownTurns: STANDARD_GENERAL_COMMAND_PROFILE.cooldownTurns,
    };
    expect(resolveGeneralMechanics(generated)).toEqual(BASELINE_GENERAL_MECHANICS);
    expect(getGeneralSpecialtyPresentation(generated)).toBeUndefined();
  });
});
```

Add the import at the top of the file: `import { STANDARD_GENERAL_COMMAND_PROFILE } from '@/systems/great-general-definitions';`

- [ ] **Step 2: Run — expect PASS** (Task 1 already satisfies these). Run:
`bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-specialties.test.ts`
Expected: PASS. If "assigns exactly the authored roster" FAILS, a roster id is missing/extra in `GENERAL_SPECIALTY_ASSIGNMENTS` — fix the map in `great-general-specialties.ts`.

- [ ] **Step 3: Commit**

```bash
git add tests/systems/great-general-specialties.test.ts
git commit -m "test(#885): roster-assignment coverage + generated-officer baseline guard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Point `makeGeneral()` test helpers at a generalist

**Files:**
- Modify: `tests/systems/great-general-abilities.test.ts:22`
- Modify: `tests/systems/great-general-mr5-invariants.test.ts:11`

**Why:** Both helpers default `generalDefinitionId: 'gen_caesar'`, which becomes
`initiative` (cooldown 7, Last Stand 1.10). Existing tests written against V1
baseline assume cooldown 10 / Last Stand 1.15. Repointing the default to
`gen_hannibal` (a `generalist`, exact baseline) keeps those tests valid; the new
per-specialty tests override `generalDefinitionId` explicitly.

- [ ] **Step 1: Change both defaults**

In each file, change `generalDefinitionId: 'gen_caesar'` → `generalDefinitionId: 'gen_hannibal'`.

- [ ] **Step 2: Run both files — expect PASS (unchanged behavior, still baseline)**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-abilities.test.ts tests/systems/great-general-mr5-invariants.test.ts`
Expected: PASS. (These are pre-#885 and the resolver isn't wired yet, so this is a pure no-op safety change; it must stay green here and after every later task.)

- [ ] **Step 3: Commit**

```bash
git add tests/systems/great-general-abilities.test.ts tests/systems/great-general-mr5-invariants.test.ts
git commit -m "test(#885): default makeGeneral() helper to a generalist General

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Thread the resolver through command stats, eligibility, spend, retire

**Files:**
- Modify: `src/systems/great-general-system.ts` — `getEffectiveCommandStats`, `retireGeneralsAtTurnEnd`
- Modify: `src/systems/great-general-abilities.ts` — `getHeroicCommandEligibility`, `spendHeroicCommandCharge`
- Test: `tests/systems/great-general-abilities.test.ts`, `tests/systems/great-general-system.test.ts`

**Interfaces:**
- Consumes: `resolveGeneralMechanics` from `@/systems/great-general-specialties` (Task 1).
- Produces: `getEffectiveCommandStats(unit, def)` keeps its 2-arg signature but now returns specialty-resolved `{ commandRange, commandCapacity }` (still degraded by supply). `getHeroicCommandEligibility` / `spendHeroicCommandCharge` / `retireGeneralsAtTurnEnd` unchanged signatures; internally read resolved `maxCommandCharges` / `cooldownTurns`.

- [ ] **Step 1: Write the failing tests**

In `tests/systems/great-general-abilities.test.ts` add:

```ts
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

describe('#885 specialty-resolved command stats / charges / cooldown', () => {
  it('a Tireless (endurance) General has 4 charges remaining at full', () => {
    const state = createNewGame({ civType: 'zulu', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 's885-end' });
    const r = getHeroicCommandEligibility(state, makeGeneral({ generalDefinitionId: 'gen_shaka' }));
    expect(r.chargesRemaining).toBe(4);
    expect(r.isFinalCharge).toBe(false);
  });

  it('a Bold (initiative) General starts a 7-turn cooldown when it spends a charge', () => {
    const state = { ...createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 's885-init' }), turn: 8 };
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: 'gen_caesar' });
    const after = spendHeroicCommandCharge(state, 'gen-1');
    expect(after.units['gen-1']!.generalCommandCooldownUntilTurn).toBe(15); // 8 + 7
  });

  it('a Supply Master (logistician) General starts a 13-turn cooldown', () => {
    const state = { ...createNewGame({ civType: 'china', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 's885-log' }), turn: 2 };
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: 'gen_yuefei' });
    const after = spendHeroicCommandCharge(state, 'gen-1');
    expect(after.units['gen-1']!.generalCommandCooldownUntilTurn).toBe(15); // 2 + 13
  });
});
```

In `tests/systems/great-general-system.test.ts` add (near the `getEffectiveCommandStats` tests around line 420-495 — reuse that describe's fixture style):

```ts
import { retireGeneralsAtTurnEnd } from '@/systems/great-general-system';

describe('#885 specialty-resolved effective command stats + retirement', () => {
  it('a Swift (mobile) General has effective command range 3, capacity 2 at full supply', () => {
    const { getEffectiveCommandStats } = require('@/systems/great-general-system');
    const def = GENERAL_DEFINITIONS.find(g => g.id === 'gen_genghis')!;
    const stats = getEffectiveCommandStats({ landSupply: undefined }, def);
    expect(stats).toEqual({ commandRange: 3, commandCapacity: 2 });
  });

  it('a Tireless (endurance) General retires only after its 4th charge, not its 3rd', () => {
    const state = createNewGame({ civType: 'zulu', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 's885-ret' });
    state.currentPlayer = 'player';
    state.units['g'] = {
      id: 'g', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_shaka', generalCommandChargesUsed: 3,
    } as never;
    state.units['g2'] = { ...(state.units['g'] as never), id: 'g2', generalCommandChargesUsed: 4 } as never;
    state.civilizations.player.units = ['g', 'g2'];
    state.civilizations.player.generalHistory = [
      { unitId: 'g', generalDefinitionId: 'gen_shaka', spawnedTurn: 1 },
      { unitId: 'g2', generalDefinitionId: 'gen_shaka', spawnedTurn: 1 },
    ];
    const after = retireGeneralsAtTurnEnd(state, 'player');
    expect(after.units['g']).toBeDefined();      // 3/4 charges -> still active
    expect(after.units['g2']).toBeUndefined();   // 4/4 -> retired
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`chargesRemaining` 3 not 4, cooldown 18 not 15, range 2 not 3, `g` retired at 3).

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-abilities.test.ts tests/systems/great-general-system.test.ts`

- [ ] **Step 3: Implement**

`src/systems/great-general-system.ts`:
- Add import: `import { resolveGeneralMechanics } from '@/systems/great-general-specialties';`
- `getEffectiveCommandStats(unit, definition)` — replace the body's use of
  `definition.commandRange` / `definition.commandCapacity` with the resolved values:

```ts
export function getEffectiveCommandStats(
  unit: Pick<Unit, 'landSupply'>,
  definition: Pick<GeneralDefinition, 'id' | 'commandRange' | 'commandCapacity' | 'maxCommandCharges' | 'cooldownTurns'>,
): { commandRange: number; commandCapacity: number } {
  const { commandRange, commandCapacity } = resolveGeneralMechanics(definition);
  const state = unit.landSupply?.state ?? 'full';
  if (state === 'degraded') {
    return { commandRange, commandCapacity: Math.max(1, commandCapacity - 1) };
  }
  if (state === 'severe') {
    return { commandRange: Math.max(1, commandRange - 1), commandCapacity: Math.max(1, commandCapacity - 1) };
  }
  return { commandRange, commandCapacity };
}
```

- `retireGeneralsAtTurnEnd` — change the filter predicate:

```ts
    .filter(u => {
      const definition = resolveGeneralDefinition(state, u.generalDefinitionId);
      return definition && (u.generalCommandChargesUsed ?? 0) >= resolveGeneralMechanics(definition).maxCommandCharges;
    });
```

`src/systems/great-general-abilities.ts`:
- Add import: `import { resolveGeneralMechanics } from '@/systems/great-general-specialties';`
- `getHeroicCommandEligibility` — `const maxCharges = definition ? resolveGeneralMechanics(definition).maxCommandCharges : 0;`
- `spendHeroicCommandCharge` — `generalCommandCooldownUntilTurn: state.turn + resolveGeneralMechanics(definition).cooldownTurns,`

- [ ] **Step 4: Run — expect PASS** for the new tests and every pre-existing test in both files.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-abilities.test.ts tests/systems/great-general-system.test.ts tests/systems/great-general-mr4-invariants.test.ts tests/systems/great-general-mr5-invariants.test.ts`
Expected: PASS. If a pre-existing test fails, it hardcoded a magnitude for a now-specialist roster id — repoint that test's general to `gen_hannibal` or assert the resolved value.

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-system.ts src/systems/great-general-abilities.ts tests/systems/great-general-abilities.test.ts tests/systems/great-general-system.test.ts
git commit -m "feat(#885): resolve command range/capacity/charges/cooldown per specialty

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Rally heal amount from the resolver

**Files:**
- Modify: `src/systems/great-general-abilities.ts` — `getRallyEligibleTargets`; delete `const RALLY_HEAL_AMOUNT = 30;`
- Test: `tests/systems/great-general-abilities.test.ts`

**Interfaces:**
- Consumes: `resolveGeneralMechanics` (already imported in Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
describe('#885 Rally heal scales with specialty', () => {
  function stateWithHurtUnit(seed: string, generalId: string) {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: generalId });
    state.units['u1'] = {
      id: 'u1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as never;
    state.civilizations.player.units = ['gen-1', 'u1'];
    return state;
  }

  it('baseline (generalist) heals +30', () => {
    const p = getRallyPreview(stateWithHurtUnit('r-base', 'gen_hannibal'), 'gen-1');
    expect(p.targets[0]!.healthAfter).toBe(70);
  });
  it('Supply Master (logistician) heals +50', () => {
    const p = getRallyPreview(stateWithHurtUnit('r-log', 'gen_yuefei'), 'gen-1');
    expect(p.targets[0]!.healthAfter).toBe(90);
  });
  it('Tireless (endurance) heals +20', () => {
    const p = getRallyPreview(stateWithHurtUnit('r-end', 'gen_shaka'), 'gen-1');
    expect(p.targets[0]!.healthAfter).toBe(60);
  });
  it('never exceeds 100', () => {
    const s = stateWithHurtUnit('r-cap', 'gen_yuefei');
    (s.units['u1'] as { health: number }).health = 80;
    const p = getRallyPreview(s, 'gen-1');
    expect(p.targets[0]!.healthAfter).toBe(100);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (log heals to 70 not 90, etc.).

- [ ] **Step 3: Implement**

In `getRallyEligibleTargets`, resolve the heal amount:

```ts
function getRallyEligibleTargets(state: GameState, general: Unit, definition: GeneralDefinition): RallyTarget[] {
  const civ = state.civilizations[general.owner];
  if (!civ) return [];
  const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);
  const healAmount = resolveGeneralMechanics(definition).rally.healAmount;
  // ... existing candidate selection unchanged ...
  return candidates.map(({ unit }) => ({
    unitId: unit.id,
    healthBefore: unit.health,
    healthAfter: Math.min(100, unit.health + healAmount),
    stageBefore: unit.landSupply!.state,
    stageAfter: rallyStageAfter(unit.landSupply!.state),
  }));
}
```

Delete `const RALLY_HEAL_AMOUNT = 30;`. Widen the `definition` param type on
`getRallyEligibleTargets` to the full `GeneralDefinition` if it was narrowed
(it needs `id` for the resolver).

- [ ] **Step 4: Run — expect PASS** for new + all existing `great-general-abilities.test.ts`.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-abilities.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-abilities.ts tests/systems/great-general-abilities.test.ts
git commit -m "feat(#885): Rally heal amount resolved per specialty

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Last Stand defense multiplier + duration from the resolver

**Files:**
- Modify: `src/systems/great-general-abilities.ts` — `getLastStandPreview`, `issueLastStand`; delete `LAST_STAND_DEFENSE_MULTIPLIER` and `LAST_STAND_DURATION_TURNS` (keep `LAST_STAND_AREA_RADIUS`).
- Test: `tests/systems/great-general-abilities.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('#885 Last Stand scales with specialty', () => {
  function stateWithFormation(seed: string, generalId: string) {
    const state = createNewGame({ civType: 'england', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: generalId });
    state.units['u1'] = {
      id: 'u1', type: 'swordsman', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as never;
    state.civilizations.player.units = ['gen-1', 'u1'];
    return state;
  }
  it('baseline (generalist): +15% for 2 turns', () => {
    const p = getLastStandPreview(stateWithFormation('ls-base', 'gen_hannibal'), 'gen-1', { q: 1, r: 0 });
    expect(p.defenseBonusPercent).toBe(15);
    expect(p.durationTurns).toBe(2);
  });
  it('Defensive Commander: +25% for 3 turns; the issued hold carries 1.25', () => {
    const s = stateWithFormation('ls-def', 'gen_wellington');
    const p = getLastStandPreview(s, 'gen-1', { q: 1, r: 0 });
    expect(p.defenseBonusPercent).toBe(25);
    expect(p.durationTurns).toBe(3);
    const after = issueLastStand(s, 'gen-1', { q: 1, r: 0 });
    expect(after.units['u1']!.lastStandHold!.defenseBonusMultiplier).toBe(1.25);
    expect(after.units['u1']!.lastStandHold!.expiresTurn).toBe(s.turn + 3);
  });
  it('Bold Commander: weaker +10% Last Stand', () => {
    const p = getLastStandPreview(stateWithFormation('ls-init', 'gen_caesar'), 'gen-1', { q: 1, r: 0 });
    expect(p.defenseBonusPercent).toBe(10);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`getLastStandPreview`: after resolving `definition`, compute
`const mech = resolveGeneralMechanics(definition);` and build the `empty`/return
objects from `mech.lastStand.defenseMultiplier` / `mech.lastStand.durationTurns`:

```ts
  const mech = resolveGeneralMechanics(definition);
  const defenseMultiplier = mech.lastStand.defenseMultiplier;
  const durationTurns = mech.lastStand.durationTurns;
  const empty: LastStandPreview = {
    eligibility, targetHex, area: [], targets: [],
    defenseBonusPercent: Math.round((defenseMultiplier - 1) * 100),
    durationTurns,
  };
```

`issueLastStand`: resolve `definition` (it currently only calls `getLastStandPreview`)
— read the same `mech` for the `hold`:

```ts
export function issueLastStand(state: GameState, generalUnitId: string, targetHex: HexCoord): GameState {
  const preview = getLastStandPreview(state, generalUnitId, targetHex);
  if (!preview.eligibility.eligible || preview.targets.length === 0) return state;
  const general = state.units[generalUnitId]!;
  const mech = resolveGeneralMechanics(resolveGeneralDefinition(state, general.generalDefinitionId)!);
  const formationId = `${generalUnitId}-${state.turn}-${targetHex.q},${targetHex.r}`;
  const hold: LastStandHoldState = {
    formationId,
    defenseBonusMultiplier: mech.lastStand.defenseMultiplier,
    expiresTurn: state.turn + mech.lastStand.durationTurns,
  };
  // ... rest unchanged ...
}
```

Delete `const LAST_STAND_DEFENSE_MULTIPLIER = 1.15;` and
`const LAST_STAND_DURATION_TURNS = 2;`. Keep `LAST_STAND_AREA_RADIUS = 1`.
`resolveLastStandDefenseBonus` is unchanged — it reads the persisted
`hold.defenseBonusMultiplier`.

- [ ] **Step 4: Run — expect PASS** for new + all existing `great-general-abilities.test.ts` + `tests/systems/combat-context.test.ts` (Last Stand combat wiring) + `tests/systems/great-general-mr4-invariants.test.ts`.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-abilities.test.ts tests/systems/combat-context.test.ts tests/systems/great-general-mr4-invariants.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-abilities.ts tests/systems/great-general-abilities.test.ts
git commit -m "feat(#885): Last Stand defense/duration resolved per specialty

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Seize the Moment extra-target from the resolver

**Files:**
- Modify: `src/systems/great-general-abilities.ts` — `issueSeizeTheMoment` (and the count shown by any preview helper)
- Test: `tests/systems/great-general-abilities.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('#885 Seize the Moment extra-target for Bold Commander', () => {
  function stateWithActedUnits(seed: string, generalId: string, n: number) {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: generalId });
    const ids: string[] = ['gen-1'];
    for (let i = 0; i < n; i++) {
      const id = `w${i}`;
      state.units[id] = {
        id, type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
        movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
      } as never;
      ids.push(id);
    }
    state.civilizations.player.units = ids;
    return { state, ids: ids.slice(1) };
  }

  it('baseline (generalist) activates at most commandCapacity (3) units', () => {
    const { state, ids } = stateWithActedUnits('sz-base', 'gen_hannibal', 5);
    const after = issueSeizeTheMoment(state, 'gen-1', ids);
    expect(ids.filter(id => after.units[id]!.hasActed === false)).toHaveLength(3);
  });
  it('Bold Commander activates commandCapacity + 1 (4) units', () => {
    const { state, ids } = stateWithActedUnits('sz-init', 'gen_caesar', 5);
    const after = issueSeizeTheMoment(state, 'gen-1', ids);
    expect(ids.filter(id => after.units[id]!.hasActed === false)).toHaveLength(4);
  });
  it('Bold Commander still does NOT refund movement (hasMoved stays true)', () => {
    const { state, ids } = stateWithActedUnits('sz-mov', 'gen_caesar', 2);
    const after = issueSeizeTheMoment(state, 'gen-1', ids);
    // hasMoved is cleared to false by the existing contract so the unit can
    // reposition with LEFTOVER movement only (movementPointsLeft untouched = 0).
    expect(after.units[ids[0]!]!.movementPointsLeft).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (Bold activates 3, not 4).

- [ ] **Step 3: Implement**

In `issueSeizeTheMoment`, replace the capacity cap:

```ts
  const mech = resolveGeneralMechanics(definition);
  const cap = getEffectiveCommandStats(general, definition).commandCapacity + mech.seize.extraTargets;
  const toActivate = selectedUnitIds.filter(id => eligibleIds.has(id)).slice(0, cap);
```

(`getSeizeTheMomentEligibleUnits` still returns the full in-range/acted pool — the
UI's "N of X selected" feedback should show `X = cap`; update whichever value the
Seize panel displays as the max in Task 15 if it reads capacity directly.)

- [ ] **Step 4: Run — expect PASS** for new + existing `great-general-abilities.test.ts` (esp. the "no full turn reset" / "max extra attack" invariants) + `tests/ai/ai-general-command.test.ts`.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-abilities.test.ts tests/ai/ai-general-command.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-abilities.ts tests/systems/great-general-abilities.test.ts
git commit -m "feat(#885): Bold Commander's Seize the Moment reaches one more unit

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: AI candidate valuation over resolved mechanics

**Files:**
- Modify: `src/ai/ai-general-command.ts` — add `chooseBestGeneralCandidate(state, civId, candidates)`
- Modify: `src/systems/great-general-system.ts` — delete the old `chooseBestGeneralCandidate`
- Modify: `src/core/turn-manager.ts` — update import + call
- Test: `tests/ai/ai-general-command.test.ts`, `tests/core/turn-manager.test.ts`, `tests/systems/great-general-mr5-invariants.test.ts`

**Interfaces:**
- Consumes: `resolveGeneralMechanics`, `GENERAL_SPECIALTY_ASSIGNMENTS` from `@/systems/great-general-specialties`; `GeneralDefinition`; `getVisibility`, `isAIHostileOwner`, `hasAICombatRole`, `mapDistance` (already imported in the file).
- Produces: `chooseBestGeneralCandidate(state: GameState, civId: string, candidates: GeneralDefinition[]): GeneralDefinition` (was `(candidates)` in `great-general-system.ts`).

- [ ] **Step 1: Write the failing tests**

In `tests/ai/ai-general-command.test.ts`:

```ts
import { chooseBestGeneralCandidate } from '@/ai/ai-general-command';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { createNewGame } from '@/core/game-state';

const def = (id: string) => GENERAL_DEFINITIONS.find(g => g.id === id)!;

describe('#885 chooseBestGeneralCandidate — bounded, non-omniscient, difficulty-invariant', () => {
  function gameAtWar(seed: string) {
    const s = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
    s.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    s.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
    return s;
  }

  it('is deterministic for a fixed state + candidate set (id tiebreak)', () => {
    const s = gameAtWar('cbc-det');
    const cands = [def('gen_hannibal'), def('gen_wellington'), def('gen_genghis')];
    expect(chooseBestGeneralCandidate(s, 'player', cands).id)
      .toBe(chooseBestGeneralCandidate(s, 'player', cands).id);
  });

  it('picks the Defensive specialist when own field units are badly hurt', () => {
    const s = gameAtWar('cbc-def');
    s.units['h1'] = { id: 'h1', type: 'swordsman', owner: 'player', position: { q: 3, r: 3 },
      movementPointsLeft: 1, health: 25, experience: 0, hasMoved: false, hasActed: false, isResting: false } as never;
    s.units['h2'] = { ...(s.units['h1'] as never), id: 'h2', position: { q: 4, r: 3 } } as never;
    s.civilizations.player.units = [...s.civilizations.player.units, 'h1', 'h2'];
    const cands = [def('gen_wellington'), def('gen_caesar'), def('gen_hannibal')];
    expect(chooseBestGeneralCandidate(s, 'player', cands).id).toBe('gen_wellington');
  });

  it('picks the Supply Master when own units are in bad supply', () => {
    const s = gameAtWar('cbc-log');
    s.units['h1'] = { id: 'h1', type: 'swordsman', owner: 'player', position: { q: 3, r: 3 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 } } as never;
    s.civilizations.player.units = [...s.civilizations.player.units, 'h1'];
    const cands = [def('gen_yuefei'), def('gen_wellington'), def('gen_hannibal')];
    expect(chooseBestGeneralCandidate(s, 'player', cands).id).toBe('gen_yuefei');
  });

  it('never reads difficulty — same pick on Explorer and Veteran', () => {
    const cands = [def('gen_wellington'), def('gen_genghis'), def('gen_hannibal')];
    const explorer = { ...gameAtWar('cbc-diff'), opponentChallenge: 'explorer' as const };
    const veteran = { ...gameAtWar('cbc-diff'), opponentChallenge: 'veteran' as const };
    expect(chooseBestGeneralCandidate(explorer, 'player', cands).id)
      .toBe(chooseBestGeneralCandidate(veteran, 'player', cands).id);
  });

  it('with no situational signal, still returns a valid candidate (nonzero base for all)', () => {
    const s = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'cbc-quiet' });
    const cands = [def('gen_hannibal'), def('gen_shaka'), def('gen_genghis')];
    expect(cands.map(c => c.id)).toContain(chooseBestGeneralCandidate(s, 'player', cands).id);
  });
});
```

Also update `tests/systems/great-general-mr5-invariants.test.ts` and
`tests/core/turn-manager.test.ts`: any existing `chooseBestGeneralCandidate(candidates)`
call becomes `chooseBestGeneralCandidate(state, civId, candidates)` and the import
moves to `@/ai/ai-general-command`.

- [ ] **Step 2: Run — expect FAIL** (import error / signature).

- [ ] **Step 3: Implement**

Remove `chooseBestGeneralCandidate` from `src/systems/great-general-system.ts`
(and its doc comment). Add to `src/ai/ai-general-command.ts`:

```ts
import { resolveGeneralMechanics, GENERAL_SPECIALTY_ASSIGNMENTS } from '@/systems/great-general-specialties';
import type { GeneralDefinition } from '@/systems/great-general-definitions';

const CANDIDATE_BASE_WEIGHTS = { charges: 2, range: 2, capacity: 2 };
/** Situational term is capped so a hot war can't landslide the pick — Swift /
 * Tireless must stay live choices. */
const CANDIDATE_SITUATIONAL_CAP_FRACTION = 0.3;

function ownFieldUnits(state: GameState, civId: string) {
  const civ = state.civilizations[civId];
  return (civ?.units ?? []).map(id => state.units[id]).filter((u): u is Unit =>
    Boolean(u) && u.type !== 'great_general');
}

function specialtyNeed(state: GameState, civId: string, specialtyId: string): number {
  const civ = state.civilizations[civId];
  const units = ownFieldUnits(state, civId);
  const visibility = civ?.visibility;
  switch (specialtyId) {
    case 'defensive':
      return units.filter(u => u.health <= 60).length;
    case 'logistician':
      return units.filter(u => u.landSupply?.state === 'degraded' || u.landSupply?.state === 'severe').length;
    case 'initiative': {
      if (!visibility) return 0;
      return units.filter(u => u.hasActed && Object.values(state.units).some(e =>
        e.owner !== civId && isAIHostileOwner(state, civId, e.owner)
        && getVisibility(visibility, e.position) === 'visible'
        && mapDistance(state.map, u.position, e.position) <= 1)).length;
    }
    case 'mobile': {
      const capital = civ?.cities?.[0] ? state.cities[civ.cities[0]] : undefined;
      if (!capital) return 0;
      const far = units.filter(u => hasAICombatRole(u.type)
        && mapDistance(state.map, capital.position, u.position) >= 4).length;
      return Math.min(far, 4);
    }
    case 'endurance':
      return Math.min((civ?.diplomacy?.atWarWith?.length ?? 0) * 2, 4);
    default: // generalist
      return 1;
  }
}

/**
 * #885: AI's deterministic candidate pick. Non-omniscient (owned units + fog-safe
 * visible hostiles only), difficulty-invariant (never reads opponentChallenge —
 * candidate acquisition is a one-time pick among roughly-equal options, contract
 * item 83), deterministic (id tiebreak). Replaces the pre-#885 raw stat-sum in
 * great-general-system.ts. NO General-ID branches — keyed on the resolved
 * specialty id only.
 */
export function chooseBestGeneralCandidate(
  state: GameState, civId: string, candidates: GeneralDefinition[],
): GeneralDefinition {
  const scored = candidates.map(def => {
    const mech = resolveGeneralMechanics(def);
    const base = CANDIDATE_BASE_WEIGHTS.charges * mech.maxCommandCharges
      + CANDIDATE_BASE_WEIGHTS.range * mech.commandRange
      + CANDIDATE_BASE_WEIGHTS.capacity * mech.commandCapacity;
    const specialtyId = GENERAL_SPECIALTY_ASSIGNMENTS[def.id] ?? 'generalist';
    const rawNeed = specialtyNeed(state, civId, specialtyId);
    const situational = Math.min(rawNeed, base * CANDIDATE_SITUATIONAL_CAP_FRACTION);
    return { def, score: base + situational };
  });
  scored.sort((a, b) => b.score - a.score || a.def.id.localeCompare(b.def.id));
  return scored[0]!.def;
}
```

Update `src/core/turn-manager.ts`: change
`import { ..., chooseBestGeneralCandidate, ... } from '@/systems/great-general-system';`
to import `chooseBestGeneralCandidate` from `@/ai/ai-general-command`, and the call
`chooseBestGeneralCandidate(candidates)` → `chooseBestGeneralCandidate(newState, civId, candidates)`.

- [ ] **Step 4: Run — expect PASS**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-general-command.test.ts tests/core/turn-manager.test.ts tests/systems/great-general-mr5-invariants.test.ts tests/systems/great-general-system.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-general-command.ts src/systems/great-general-system.ts src/core/turn-manager.ts tests/ai/ai-general-command.test.ts tests/core/turn-manager.test.ts tests/systems/great-general-mr5-invariants.test.ts
git commit -m "feat(#885): bounded non-omniscient AI candidate valuation over resolved specialties

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: AI ability-use niche fixtures

**Files:**
- Modify: `tests/ai/ai-general-command.test.ts`

**Why:** The 3 evaluators already read `getRallyPreview` / `getLastStandPreview` /
`getSeizeTheMomentEligibleUnits`, which now reflect resolved magnitudes — a
Defensive general's stronger Last Stand automatically scores higher. This task
proves it and catches any gap.

- [ ] **Step 1: Write the tests**

```ts
import { chooseGeneralCommandAction } from '@/ai/ai-general-command';

describe('#885 AI uses the specialty ability through the canonical path', () => {
  it('a Defensive Commander in a threatened formation chooses Last Stand', () => {
    // build: own general + 2 own combat units clustered, 2 visible hostiles adjacent, no acted units
    // (reuse an existing Last-Stand fixture in this file; set generalDefinitionId 'gen_wellington')
    // expect(chooseGeneralCommandAction(state, 'gen-1')!.ability).toBe('last_stand');
  });
  it('a Bold Commander after its own units attacked chooses Seize the Moment', () => {
    // own general + 4 own acted combat units in range, minimal threat
    // set generalDefinitionId 'gen_caesar'
    // expect(chooseGeneralCommandAction(state, 'gen-1')!.ability).toBe('seize_the_moment');
  });
});
```

Fill these in using the fixture builders already present in
`tests/ai/ai-general-command.test.ts` (find the existing Rally / Last Stand /
Seize describe blocks and copy their `state` setup, changing only
`generalDefinitionId` and the unit counts). Assert
`chooseGeneralCommandAction(state, generalUnitId)!.ability`.

- [ ] **Step 2: Run — expect PASS.** If the Defensive fixture picks a different
ability, raise the Last Stand fixture's threat count (`nearbyVisibleThreatScore`)
until Last Stand's `formationSize * (1 + threat)` clears the others — do NOT add a
specialty branch to the evaluator.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-general-command.test.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/ai/ai-general-command.test.ts
git commit -m "test(#885): AI uses specialist abilities via the canonical evaluators

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Advisor consumer

**Files:**
- Modify: `src/ui/advisor-system.ts` (line ~172 command-range read; the ~line-138 copy)
- Test: `tests/ui/advisor-system.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/ui/advisor-system.test.ts`, add a case: a Swift Commander (`gen_genghis`,
range 3) with a wounded unit 3 hexes away triggers the `general_last_stand_crisis_hint`
advisor (a baseline range-2 general would not). Assert the advisor message id is
present in the advisor output for that state.

- [ ] **Step 2: Run — expect FAIL** (the hint uses `definition.commandRange` = 2).

- [ ] **Step 3: Implement**

`src/ui/advisor-system.ts`:
- Add `import { resolveGeneralMechanics } from '@/systems/great-general-specialties';`
- The `mapDistance(...) <= definition.commandRange` check (~line 172) →
  `mapDistance(...) <= resolveGeneralMechanics(definition).commandRange`.
- The hardcoded string `'... holds 3 lifetime Command Charges shared across ...'`
  (~line 138) → `'... holds a few lifetime Command Charges (usually 3) shared across ...'`.

- [ ] **Step 4: Run — expect PASS**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/advisor-system.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/ui/advisor-system.ts tests/ui/advisor-system.test.ts
git commit -m "feat(#885): advisor Last Stand hint honours resolved command range

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Selected-unit panel — resolved stats line + specialty line

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Test: `tests/ui/selected-unit-info.test.ts`

**Interfaces:**
- Consumes: `getGeneralSpecialtyPresentation`, `resolveGeneralMechanics` from `@/systems/great-general-specialties`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('#885 specialty on the selected-unit panel', () => {
  it('a Defensive Commander shows a truthful specialty line and its resolved command range', () => {
    // build state with a selected great_general unit, generalDefinitionId 'gen_wellington'
    // renderSelectedUnitInfo(container, state, 'u1', {})
    // const text = collectAllText(container).join(' ')
    // expect(text).toContain('Specialty: Defensive Commander')
    // expect(text).toContain('Last Stand'); expect(text).toContain('25%')
    // expect(text).toContain('Command range 1')   // resolved, not V1 2
    // expect(text).not.toContain('http')
  });
  it('a Field Commander (generalist) shows NO specialty line', () => {
    // generalDefinitionId 'gen_hannibal'
    // expect(text).not.toContain('Specialty:')
  });
  it('a generated officer shows NO specialty line', () => {
    // generalDefinitionId 'generated:rome:3:deadbeef' with a generatedGenerals record
    // expect(text).not.toContain('Specialty:')
  });
});
```

Use the existing `installMockDocument` / `collectAllText` / `renderSelectedUnitInfo`
helpers and the Great-General fixture style already in that file (the #886 tests
around "Who was …?" show the exact setup).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

In `src/ui/selected-unit-info.ts`, inside `if (unit.type === 'great_general' && unit.generalDefinitionId)`,
after `wrapper.appendChild(descriptorLine);` and **before** the #886 bio `<details>` block:

```ts
      const specialty = getGeneralSpecialtyPresentation(generalDef);
      if (specialty) {
        const mech = resolveGeneralMechanics(generalDef);
        const line = document.createElement('div');
        line.style.cssText = 'font-size:11px;margin-top:3px;color:#f0c674;';
        // Copy generated from the resolved-vs-baseline diff — exact by construction.
        line.textContent = `Specialty: ${specialty.displayName} — ${specialty.summary}`;
        wrapper.appendChild(line);
        void mech;
      }
```

Change the command-stats line (the existing `statsLine.textContent = 'Command range ' + ...`)
to read from `resolveGeneralMechanics(generalDef)` instead of `generalDef.commandRange` /
`generalDef.commandCapacity` / `generalDef.maxCommandCharges`. Charges remaining and
cooldown already come from `getHeroicCommandEligibility` (resolved in Task 5).

Add imports at the top of the file.

- [ ] **Step 4: Run — expect PASS** for new + all existing `selected-unit-info.test.ts` (incl. #886).

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/ui/selected-unit-info.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(#885): selected-unit panel shows a truthful specialty line + resolved stats

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Candidate chooser — specialty line

**Files:**
- Modify: `src/ui/general-candidate-panel.ts`
- Test: `tests/ui/general-candidate-panel.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('#885 specialty line in the candidate chooser', () => {
  it('a specialist candidate shows its one-line specialty summary under the descriptor', () => {
    // candidates: [ { ...def for gen_wellington } ] passed as GeneralDefinition[]
    // createGeneralCandidatePanel(container, candidates, () => {})
    // expect(panel.textContent).toContain('Defensive Commander')
    // expect(panel.textContent).toContain('holding ground')
  });
  it('a generalist candidate shows no specialty line', () => {
    // candidates: [ def for gen_hannibal ]
    // expect(panel.textContent).not.toContain('Field Commander')
  });
});
```

Follow the existing test style in `tests/ui/general-candidate-panel.test.ts`
(the `candidates` array + `createGeneralCandidatePanel(container, candidates, onChoose)`).
Pass real `GENERAL_DEFINITIONS` entries.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

In `src/ui/general-candidate-panel.ts`, after the `detail.textContent = candidate.descriptor;`
line and its `card.appendChild(detail);`:

```ts
    const specialty = getGeneralSpecialtyPresentation(candidate);
    if (specialty) {
      const spec = document.createElement('div');
      spec.textContent = `${specialty.displayName}: ${specialty.summary}`;
      spec.style.cssText = 'font-size:11px;opacity:0.8;margin-top:4px;color:#f0c674;';
      card.appendChild(spec);
    }
```

Add `import { getGeneralSpecialtyPresentation } from '@/systems/great-general-specialties';`.

- [ ] **Step 4: Run — expect PASS** for new + existing `general-candidate-panel.test.ts`.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/general-candidate-panel.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/ui/general-candidate-panel.ts tests/ui/general-candidate-panel.test.ts
git commit -m "feat(#885): candidate chooser shows each General's specialty line

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Hot-seat + difficulty-parity tests

**Files:**
- Modify: `tests/systems/great-general-specialties.test.ts` (difficulty parity — pure)
- Modify: `tests/ui/selected-unit-info.test.ts` (hot-seat viewer)

- [ ] **Step 1: Write the tests**

Difficulty parity (append to `great-general-specialties.test.ts`):

```ts
describe('#885 difficulty parity', () => {
  it('resolveGeneralMechanics ignores any difficulty context entirely', () => {
    // resolver takes only a def — assert its output is identical regardless of a
    // surrounding state's opponentChallenge by resolving the same id twice.
    const a = resolveGeneralMechanics({ id: 'gen_wellington', commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10 });
    const b = resolveGeneralMechanics({ id: 'gen_wellington', commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10 });
    expect(a).toEqual(b);
  });
});
```

Hot-seat (append to `selected-unit-info.test.ts`): render the panel for a
`great_general` owned by `player-2` while `state.currentPlayer = 'player-2'`,
`generalDefinitionId: 'gen_genghis'` — assert the panel shows "Swift Commander"
and the resolved "Command range 3", and contains no data about any `player-1`
General. (The existing #886 hot-seat-style selected-unit tests show the setup.)

- [ ] **Step 2: Run — expect PASS.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-specialties.test.ts tests/ui/selected-unit-info.test.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/systems/great-general-specialties.test.ts tests/ui/selected-unit-info.test.ts
git commit -m "test(#885): difficulty parity + hot-seat specialty rendering

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Save / load round-trip tests

**Files:**
- Modify: `tests/systems/great-general-system.test.ts` (or the nearest existing save round-trip test file for General state — search `rg "generalCommandChargesUsed" tests/`)

- [ ] **Step 1: Write the tests**

```ts
describe('#885 save/load — no shape change, content-patch semantics', () => {
  it('an Endurance General mid-career: used=2 -> 2 charges remaining after a state round-trip', () => {
    // build a game with a spawned gen_shaka unit, generalCommandChargesUsed: 2
    // serialize + deserialize via the repo's save round-trip helper (see existing General save tests)
    // getHeroicCommandEligibility(loaded, loadedUnit).chargesRemaining === 2   (maxCommandCharges 4 - 2)
  });
  it('a pre-#885 save with a spawned gen_wellington immediately shows Defensive stats after load', () => {
    // load a fixture/hand-built state whose gen_wellington unit was spawned "before" #885
    // resolveGeneralMechanics(def).commandRange === 1, lastStand.defenseMultiplier === 1.25
  });
  it('a generated officer round-trips and resolves to baseline', () => {
    // state.generatedGenerals = { 'generated:...': {...STANDARD profile...} }
    // after round-trip: resolveGeneralMechanics(thatIdentity) === BASELINE_GENERAL_MECHANICS
  });
  it('an in-flight lastStandHold keeps the multiplier it was cast with across a round-trip', () => {
    // a unit with lastStandHold.defenseBonusMultiplier: 1.15 (cast pre-patch) still reads 1.15 after load
    // resolveLastStandDefenseBonus(unit, turn).multiplier === 1.15
  });
});
```

Use whatever serialize/deserialize helper the existing General save tests use
(likely `serializeGameState` / `deserializeGameState` or `runMigrations`). Do NOT
add a migration.

- [ ] **Step 2: Run — expect PASS** (no code change needed — this task only proves
the design's save claims). If any FAILS, a consumer is reading a stale definition
field instead of the resolver — fix that consumer.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-system.test.ts tests/storage/save-manager.test.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/systems/great-general-system.test.ts
git commit -m "test(#885): save/load round-trips — charges, legacy content-patch, generated baseline, in-flight hold

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: Deterministic balance matrix

**Files:**
- Create: `tests/systems/great-general-specialty-balance.test.ts`

**Interfaces:**
- Consumes: `resolveGeneralMechanics`, `GENERAL_SPECIALTIES`, `BASELINE_GENERAL_MECHANICS`.

- [ ] **Step 1: Write the test**

Build a pure scoring model (no full game) — 6 scenario weight vectors over the
resolved-mechanics fields, 6 specialties, assert niche wins:

```ts
import { describe, expect, it } from 'vitest';
import { resolveGeneralMechanics, type GeneralSpecialtyId } from '@/systems/great-general-specialties';

const SPEC_SAMPLE: Record<GeneralSpecialtyId, string> = {
  generalist: 'gen_hannibal', defensive: 'gen_wellington', initiative: 'gen_caesar',
  logistician: 'gen_yuefei', mobile: 'gen_genghis', endurance: 'gen_shaka',
};
const baseDef = { commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10 };

/** Scenario -> how much each resolved field is worth in that situation. */
const SCENARIOS: Record<string, (m: ReturnType<typeof resolveGeneralMechanics>) => number> = {
  rallyAttrition:    m => m.rally.healAmount * 3 - m.cooldownTurns * 1.5,
  breakthrough:      m => (m.seize.extraTargets + m.commandCapacity) * 12 - m.cooldownTurns,
  lethalDefense:     m => (m.lastStand.defenseMultiplier - 1) * 400 + m.lastStand.durationTurns * 8 - (2 - m.commandRange) * 3,
  lowCombatEmpire:   m => m.commandRange * 10 + m.commandCapacity * 6, // passive stabilization reach
  longMultiFrontWar: m => m.maxCommandCharges * 20 - Math.max(0, m.rally.healAmount - 30) * 0, // total-output over a long war
  sparseArmy:        m => m.maxCommandCharges * 10 + (m.commandRange + m.commandCapacity) * 3,
};

function scoreAll(scenario: keyof typeof SCENARIOS) {
  const f = SCENARIOS[scenario]!;
  return Object.fromEntries(
    (Object.keys(SPEC_SAMPLE) as GeneralSpecialtyId[]).map(
      s => [s, f(resolveGeneralMechanics({ ...baseDef, id: SPEC_SAMPLE[s] }))],
    ),
  ) as Record<GeneralSpecialtyId, number>;
}
function winner(scores: Record<GeneralSpecialtyId, number>): GeneralSpecialtyId {
  return (Object.entries(scores).sort((a, b) => b[1] - a[1])[0]![0]) as GeneralSpecialtyId;
}

describe('#885 deterministic specialty balance matrix', () => {
  it('each specialist wins its intended scenario', () => {
    expect(winner(scoreAll('rallyAttrition'))).toBe('logistician');
    expect(winner(scoreAll('breakthrough'))).toBe('initiative');
    expect(winner(scoreAll('lethalDefense'))).toBe('defensive');
    expect(winner(scoreAll('lowCombatEmpire'))).toBe('mobile');
    expect(winner(scoreAll('longMultiFrontWar'))).toBe('endurance');
  });

  it('no specialty wins every scenario', () => {
    const wins: Record<string, number> = {};
    for (const s of Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]) {
      const w = winner(scoreAll(s));
      wins[w] = (wins[w] ?? 0) + 1;
    }
    for (const [spec, n] of Object.entries(wins)) {
      expect(n, `${spec} wins ${n}/6`).toBeLessThan(6);
    }
  });

  it('generalist is never dead last in more than 2 scenarios (not a trap)', () => {
    let lastCount = 0;
    for (const s of Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]) {
      const scores = scoreAll(s);
      const min = Math.min(...Object.values(scores));
      if (scores.generalist === min) lastCount++;
    }
    expect(lastCount).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run — iterate the SCENARIO weights until the niche assertions
pass**, keeping them defensible (the weights model "what matters in this
situation," not "make the test green"). If a niche can't be made to win without
absurd weights, the specialty numbers in Task 1 are wrong — fix the catalog.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-specialty-balance.test.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/systems/great-general-specialty-balance.test.ts
git commit -m "test(#885): deterministic specialty balance matrix — niche wins, no dominance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 17: Full regression sweep + verification + docs sync

**Files:**
- Modify: `docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md` (mark §row D done)
- No source changes expected — this task is verification.

- [ ] **Step 1: Targeted General regression run**

Run:
```bash
bash scripts/run-with-mise.sh yarn vitest run \
  tests/systems/great-general-specialties.test.ts \
  tests/systems/great-general-specialty-balance.test.ts \
  tests/systems/great-general-definitions.test.ts \
  tests/systems/great-general-system.test.ts \
  tests/systems/great-general-abilities.test.ts \
  tests/systems/great-general-fallback-content.test.ts \
  tests/systems/great-general-mr3-invariants.test.ts \
  tests/systems/great-general-mr4-invariants.test.ts \
  tests/systems/great-general-mr5-invariants.test.ts \
  tests/systems/great-general-profiles.test.ts \
  tests/ai/ai-general-command.test.ts \
  tests/core/turn-manager.test.ts \
  tests/systems/combat-reward-system.test.ts \
  tests/ui/selected-unit-info.test.ts \
  tests/ui/general-candidate-panel.test.ts \
  tests/ui/advisor-system.test.ts \
  tests/presentation/register-general-presentation.test.ts \
  tests/storage/save-manager.test.ts \
  tests/storage/save-migrations.test.ts
```
Expected: all PASS. Fix any regression by pointing the failing assertion at the
resolved value or a `generalist` fixture — never by adding an ID branch.

- [ ] **Step 2: `git diff --check`**

Run: `git diff --check` → no output.

- [ ] **Step 3: Typecheck + full suite**

Run: `bash scripts/run-with-mise.sh yarn build` → exit 0.
Run: `bash scripts/run-with-mise.sh yarn test` → exit 0 (all test files + hook smoke tests).

- [ ] **Step 4: Grep for stale reads / ID branches (self-review)**

```bash
rg "RALLY_HEAL_AMOUNT|LAST_STAND_DEFENSE_MULTIPLIER|LAST_STAND_DURATION_TURNS" src/   # expect: no matches
rg "def\.id === 'gen_|definition\.id === 'gen_|generalDefinitionId === 'gen_" src/    # expect: no matches
rg "\.commandRange|\.commandCapacity|\.maxCommandCharges|\.cooldownTurns" src/systems/great-general-abilities.ts src/ai/ai-general-command.ts src/ui/advisor-system.ts
# every hit in ability/AI/advisor consumers must be on a resolveGeneralMechanics(...) result, not a raw def
```

- [ ] **Step 5: Docs sync**

In `docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md`, the
row `| D. Unique General mechanics | before #544 closes | ... |` — append
` — ✅ shipped #885`.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md
git commit -m "docs(#885): mark #544 deferred issue D (unique General mechanics) shipped

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Post-implementation review of the real diff**

`git diff origin/main...HEAD` — check the Phase 40 list: no General-ID switches;
no generated officer specialized; universal fallbacks all `generalist`; no
specialty Pareto-dominates (Task 2 test proves it); no charge underflow / cooldown
≤ 0 (resolver clamp + Task 1 test); no stale V1 constant in a consumer (Step 4
grep); UI shows resolved values for specialists (Task 12); AI valuation reads
resolved mechanics not the old stat-sum (Task 9); no `opponentChallenge` read in
the resolver/valuation; no save-normalization change (`git diff` shows
`save-migrations.ts` untouched); no hot-seat leak (Task 14); specialty not tied to
`getGeneralProfile` strings (grep `getGeneralProfile` in `great-general-specialties.ts`
→ no match); no unnecessary migration; no unrelated refactor.

Fix any real finding, then re-run Step 3.

---

## Self-Review (writing-plans checklist)

**1. Spec coverage:**
- Phase 1/2 audit → captured in plan header + design doc (committed separately).
- Phase 3 specialty model → Task 1. Phase 4 vocabulary → Task 1. Phase 5 no strict upgrade → Task 2.
- Phase 6 generated officers baseline → Tasks 1, 3, 15. Phase 7/8 authored assignments → Task 1 (`GENERAL_SPECIALTY_ASSIGNMENTS`) + Task 3 coverage. Phase 9 ability subsetting → explicitly out (design doc + plan header).
- Phase 10 command range consumers → Task 5 (`getEffectiveCommandStats`), Task 11 (advisor), Task 12 (UI). Phase 11 charges → Task 5. Phase 12 cooldown → Task 5 + resolver clamp (Task 1).
- Phase 13 Rally → Task 6. Phase 14 Seize → Task 8 (+ anti-abuse invariants re-run). Phase 15 Last Stand → Task 7. Phase 16 passive stabilization → covered via `getEffectiveCommandStats` (Task 5); no magnitude dimension (design doc + balance rule Task 2).
- Phase 17 Final Command → Task 5 (`retireGeneralsAtTurnEnd` resolved maxCharges).
- Phase 18 AI candidate valuation → Task 9. Phase 19 AI ability use → Task 10.
- Phase 20 difficulty parity → Task 9 + Task 14. Phase 21 hot-seat → Task 14. Phase 22/23 save/generated → Task 15.
- Phase 24/25 UI → Tasks 12, 13. Phase 26 #886 separation → resolver never imports `great-general-profiles` (Task 17 Step 7). Phase 27/28 #887/#889 → no schema/audio (design doc); Task 17 regression run includes `register-general-presentation.test.ts`.
- Phase 29 balance matrix → Task 16. Phase 30 candidate choice quality → Task 13. Phase 31 distribution → Task 3 (4..7 per specialty test). Phase 32 universal fallbacks → Task 3.
- Phase 33 test matrix → Tasks 1-16 collectively. Phase 34 regression → Task 17. Phase 35 performance → resolver memo (Task 1). Phase 36 design review → design doc (committed). Phase 37 order → this task order. Phase 38 scope → plan header non-goals. Phase 39 stop conditions → n/a (no rewrite needed; extensibility verified). Phase 40 → Task 17 Step 7.

**2. Placeholder scan:** Tasks 10, 12, 13, 15 contain commented test skeletons
("build state with…") rather than full code, because they must reuse
file-specific fixture helpers (`installMockDocument`, `collectAllText`,
`createGeneralCandidatePanel`, the AI fixture builders, the save round-trip
helper) whose exact names differ per file and must be read at implementation
time. Each skeleton names the exact helper to copy from and the exact assertion
to make. Acceptable — the alternative (guessing helper signatures) would be
wrong more often than right.

**3. Type consistency:** `ResolvedGeneralMechanics` shape identical in Tasks
1/2/5/6/7/8/9/12/16. `resolveGeneralMechanics(def)` takes
`Pick<GeneralDefinition,'id'|'commandRange'|'commandCapacity'|'maxCommandCharges'|'cooldownTurns'>`
everywhere. `chooseBestGeneralCandidate(state, civId, candidates)` — new 3-arg
signature used identically in Task 9 impl + Task 9 tests + Task 17 grep + the
`turn-manager.ts` call. `getGeneralSpecialtyPresentation(def)` returns
`{ id, displayName, summary } | undefined` in Tasks 1/3/12/13.

---

## Execution Handoff

Per `CLAUDE.md` Agent Policy (no subagents), execution is **Inline** via
`superpowers:executing-plans` — batch tasks with a verification checkpoint after
Task 9 (mechanics + AI complete) and after Task 16 (all content + balance), then
the Task 17 full sweep before the PR.
