import { describe, expect, it } from 'vitest';
import {
  BASELINE_GENERAL_MECHANICS,
  GENERAL_SPECIALTIES,
  GENERAL_SPECIALTY_ASSIGNMENTS,
  getGeneralSpecialtyPresentation,
  resolveGeneralMechanics,
  type GeneralSpecialtyId,
} from '@/systems/great-general-specialties';
import { GENERAL_DEFINITIONS, STANDARD_GENERAL_COMMAND_PROFILE } from '@/systems/great-general-definitions';

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

  it('hard-clamps a bad base to safe floors (never cooldown 0 / negative charges)', () => {
    const m = resolveGeneralMechanics({ id: 'gen_wellington', commandRange: 0, commandCapacity: 0, maxCommandCharges: 0, cooldownTurns: 0 });
    expect(m.commandRange).toBeGreaterThanOrEqual(1);
    expect(m.commandCapacity).toBeGreaterThanOrEqual(1);
    expect(m.maxCommandCharges).toBeGreaterThanOrEqual(1);
    expect(m.cooldownTurns).toBeGreaterThanOrEqual(1);
    expect(m.rally.healAmount).toBeGreaterThanOrEqual(0);
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

// ---------------------------------------------------------------------------
// Task 2 — bounds + no strict upgrade
// ---------------------------------------------------------------------------

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

const SPEC_SAMPLE: Record<string, string> = {
  generalist: 'gen_hannibal', defensive: 'gen_wellington', initiative: 'gen_caesar',
  logistician: 'gen_yuefei', mobile: 'gen_genghis', endurance: 'gen_shaka',
};

describe('#885 specialty bounds + no strict upgrade', () => {
  it('every specialty resolves within the documented bounds', () => {
    for (const [spec, id] of Object.entries(SPEC_SAMPLE)) {
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
    for (const [spec, id] of Object.entries(SPEC_SAMPLE)) {
      if (spec === 'generalist') continue;
      const f = flat(resolveGeneralMechanics({ ...baseDef, id }));
      const keys = Object.keys(b) as (keyof typeof b)[];
      expect(keys.some(k => f[k] > b[k]), `${spec} has no boost`).toBe(true);
      expect(keys.some(k => f[k] < b[k]), `${spec} has no cost`).toBe(true);
    }
  });

  it('no specialty Pareto-dominates another or the generalist', () => {
    const ids = Object.values(SPEC_SAMPLE);
    const mats = ids.map(id => flat(resolveGeneralMechanics({ ...baseDef, id })));
    const keys = Object.keys(mats[0]!) as (keyof (typeof mats)[0])[];
    for (let i = 0; i < mats.length; i++) {
      for (let j = 0; j < mats.length; j++) {
        if (i === j) continue;
        const aDominates = keys.every(k => mats[i]![k] >= mats[j]![k]) && keys.some(k => mats[i]![k] > mats[j]![k]);
        expect(aDominates, `${ids[i]} Pareto-dominates ${ids[j]}`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Task 3 — roster assignments + generated/universal policy
// ---------------------------------------------------------------------------

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

  it('distribution stays legible — 4..7 per non-generalist specialty, >=5 generalist', () => {
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

// ---------------------------------------------------------------------------
// Task 14 — difficulty parity (pure)
// ---------------------------------------------------------------------------

describe('#885 difficulty parity', () => {
  it('resolveGeneralMechanics takes only a def and is deterministic', () => {
    const a = resolveGeneralMechanics({ id: 'gen_wellington', commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10 });
    const b = resolveGeneralMechanics({ id: 'gen_wellington', commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10 });
    expect(a).toEqual(b);
  });
});
