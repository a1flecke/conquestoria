import { describe, expect, it } from 'vitest';
import { resolveGeneralMechanics, type GeneralSpecialtyId } from '@/systems/great-general-specialties';

/**
 * #885 deterministic balance matrix. A pure scoring model (no full game): each
 * scenario weights the resolved-mechanics fields by "what matters here". The
 * goal is NOT equal scores — it is that each specialist wins its intended niche,
 * no specialty wins everything, and the generalist is never a trap.
 */
const SPEC_SAMPLE: Record<GeneralSpecialtyId, string> = {
  generalist: 'gen_hannibal',
  defensive: 'gen_wellington',
  initiative: 'gen_caesar',
  logistician: 'gen_yuefei',
  mobile: 'gen_genghis',
  endurance: 'gen_shaka',
};
const baseDef = { commandRange: 2, commandCapacity: 3, maxCommandCharges: 3, cooldownTurns: 10 };

type M = ReturnType<typeof resolveGeneralMechanics>;
const SCENARIOS: Record<string, (m: M) => number> = {
  rallyAttrition: m => m.rally.healAmount * 3 - m.cooldownTurns * 1.5,
  breakthrough: m => (m.seize.extraTargets + m.commandCapacity) * 12 - m.cooldownTurns,
  lethalDefense: m => (m.lastStand.defenseMultiplier - 1) * 400 + m.lastStand.durationTurns * 8 - (2 - m.commandRange) * 3,
  lowCombatEmpire: m => m.commandRange * 10 + m.commandCapacity * 6, // passive-stabilization reach
  longMultiFrontWar: m => m.maxCommandCharges * 20 - m.cooldownTurns,
  sparseArmy: m => m.maxCommandCharges * 10 + (m.commandRange + m.commandCapacity) * 3,
};

function scoreAll(scenario: keyof typeof SCENARIOS): Record<GeneralSpecialtyId, number> {
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
      expect(n, `${spec} wins ${n}/${Object.keys(SCENARIOS).length}`).toBeLessThan(Object.keys(SCENARIOS).length);
    }
  });

  it('the generalist is never dead last in more than 2 scenarios (not a trap)', () => {
    let lastCount = 0;
    for (const s of Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]) {
      const scores = scoreAll(s);
      if (scores.generalist === Math.min(...Object.values(scores))) lastCount++;
    }
    expect(lastCount).toBeLessThanOrEqual(2);
  });
});
