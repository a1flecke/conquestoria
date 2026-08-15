import { getBarbarianEligibility } from '@/systems/barbarian-roster';
import { composeBarbarianForce } from '@/systems/barbarian-force-composer';

function countByRole(force: ReturnType<typeof composeBarbarianForce>) {
  return force.reduce<Record<string, number>>((counts, unitType) => {
    const eligibility = getBarbarianEligibility(unitType);
    if (eligibility.status === 'eligible') {
      counts[eligibility.roleSlot] = (counts[eligibility.roleSlot] ?? 0) + 1;
    }
    return counts;
  }, {});
}

describe('composeBarbarianForce', () => {
  it('is deterministic for the same complete composition context', () => {
    const context = { era: 6, forceSize: 10, escalated: false, seed: 73421 };

    expect(composeBarbarianForce(context)).toEqual(composeBarbarianForce(context));
  });

  it.each([1, 3, 6, 8, 10, 12])('uses only legal era-%i unit definitions', (era) => {
    const force = composeBarbarianForce({ era, forceSize: 10, escalated: false, seed: era * 11 });

    // Some eras intentionally have too few legal role families to fill every
    // requested slot without breaking a composition cap.
    expect(force.length).toBeGreaterThan(0);
    expect(force.length).toBeLessThanOrEqual(10);
    for (const unitType of force) {
      const eligibility = getBarbarianEligibility(unitType);
      expect(eligibility.status).toBe('eligible');
      if (eligibility.status === 'eligible') {
        expect(eligibility.eraWindow.min).toBeLessThanOrEqual(era);
        expect(eligibility.eraWindow.max ?? Infinity).toBeGreaterThanOrEqual(era);
      }
    }
  });

  it('keeps a full force within the approved combined-arms caps', () => {
    const force = composeBarbarianForce({ era: 10, forceSize: 10, escalated: false, seed: 809 });
    const roles = countByRole(force);
    const siegeCount = force.filter(unitType => {
      const eligibility = getBarbarianEligibility(unitType);
      return eligibility.status === 'eligible' && eligibility.roleSlot === 'siege';
    }).length;

    expect(roles.frontline).toBeGreaterThanOrEqual(4);
    expect(roles.frontline).toBeLessThanOrEqual(6);
    expect((roles.ranged ?? 0) + siegeCount).toBeLessThanOrEqual(3);
    expect(roles.mobile ?? 0).toBeLessThanOrEqual(4);
    expect(roles.specialist ?? 0).toBeLessThanOrEqual(2);
    expect(roles['anti-air'] ?? 0).toBeLessThanOrEqual(1);
    expect(siegeCount).toBeLessThanOrEqual(1);
  });

  it.each([1, 3, 6, 8, 10, 12].flatMap(era => [17, 43, 91].map(seed => ({ era, seed }))))
  ('preserves caps for era $era and seed $seed', ({ era, seed }) => {
    const forceSize = 10;
    const force = composeBarbarianForce({ era, forceSize, escalated: false, seed });
    const roles = countByRole(force);
    const siegeCount = roles.siege ?? 0;

    expect(roles.frontline ?? 0).toBeGreaterThanOrEqual(Math.ceil(forceSize * 0.4));
    expect(roles.frontline ?? 0).toBeLessThanOrEqual(Math.floor(forceSize * 0.6));
    expect((roles.ranged ?? 0) + siegeCount).toBeLessThanOrEqual(Math.floor(forceSize * 0.3));
    expect(roles.mobile ?? 0).toBeLessThanOrEqual(Math.floor(forceSize * 0.4));
    expect(roles.specialist ?? 0).toBeLessThanOrEqual(Math.floor(forceSize * 0.25));
    expect(roles['anti-air'] ?? 0).toBeLessThanOrEqual(1);
    expect(siegeCount).toBeLessThanOrEqual(1);
  });

  it('does not admit observation-gated specialists without a supplied observation', () => {
    const force = composeBarbarianForce({ era: 10, forceSize: 10, escalated: false, seed: 99 });

    expect(force).not.toContain('anti_tank_gun');
    expect(force).not.toContain('mobile_aa');
  });

  it('admits observed counters while preserving their per-force caps', () => {
    const force = composeBarbarianForce({
      era: 10,
      forceSize: 20,
      escalated: false,
      observedThreats: ['armor', 'air'],
      seed: 429,
    });

    expect(force.filter(unitType => unitType === 'mobile_aa')).toHaveLength(1);
    expect(force.filter(unitType => unitType === 'anti_tank_gun').length).toBeLessThanOrEqual(5);
  });

  it('never selects mutually exclusive heavy and light cavalry together', () => {
    const force = composeBarbarianForce({ era: 6, forceSize: 20, escalated: false, seed: 551 });

    expect(force.includes('cavalry') && force.includes('cuirassier')).toBe(false);
  });

  it('has an era-safe frontline fallback and no resource or difficulty input', () => {
    const force = composeBarbarianForce({ era: 99, forceSize: 1, escalated: false, seed: 7 });

    expect(force).toHaveLength(1);
    expect(getBarbarianEligibility(force[0]!).status).toBe('eligible');
    expect(composeBarbarianForce({ era: 6, forceSize: 8, escalated: false, seed: 3 }))
      .toEqual(composeBarbarianForce({ era: 6, forceSize: 8, escalated: false, seed: 3 }));
  });

  it('falls back to the earliest playable era instead of returning an empty force', () => {
    const force = composeBarbarianForce({ era: 0, forceSize: 1, escalated: false, seed: 7 });

    expect(force).toHaveLength(1);
    expect(['warrior', 'axeman']).toContain(force[0]);
  });

  it('normalizes a non-finite era to the earliest playable force', () => {
    const force = composeBarbarianForce({ era: Number.NaN, forceSize: 1, escalated: false, seed: 7 });

    expect(force).toHaveLength(1);
    expect(['warrior', 'axeman']).toContain(force[0]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects non-finite force size %p', (forceSize) => {
    expect(composeBarbarianForce({ era: 6, forceSize, escalated: false, seed: 1 })).toEqual([]);
  });

  it('returns no members when no force is requested', () => {
    expect(composeBarbarianForce({ era: 6, forceSize: 0, escalated: false, seed: 1 })).toEqual([]);
  });
});
