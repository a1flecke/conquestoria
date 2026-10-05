import { describe, expect, it } from 'vitest';
import {
  estimateMilitaryStrength,
  isMilitaryStrengthUnit,
  type StrengthObservation,
} from '@/systems/diplomatic-strength';

function observation(
  overrides: Partial<StrengthObservation> = {},
): StrengthObservation {
  return {
    type: 'warrior',
    health: 100,
    experience: 0,
    source: 'visible',
    confidence: 1,
    uncertainty: 0,
    locallyAvailable: true,
    cargoOrCaptured: false,
    ...overrides,
  };
}

describe('AI military strength estimation', () => {
  it('applies the same formula regardless of who owns an observation', () => {
    const own = estimateMilitaryStrength([
      observation({ type: 'swordsman', health: 80, experience: 25 }),
    ]);
    const opponent = estimateMilitaryStrength([
      observation({ type: 'swordsman', health: 80, experience: 25 }),
    ]);

    expect(own).toEqual(opponent);
  });

  it('scales visible combat strength by health and bounded experience', () => {
    const healthy = estimateMilitaryStrength([observation()]);
    const damagedVeteran = estimateMilitaryStrength([
      observation({ health: 50, experience: 50 }),
    ]);
    const cappedVeteran = estimateMilitaryStrength([
      observation({ experience: 500 }),
    ]);

    expect(healthy.exactVisible).toBe(10);
    expect(damagedVeteran.exactVisible).toBeCloseTo(5.5);
    expect(cappedVeteran.exactVisible).toBeCloseTo(12);
  });

  it('decays remembered strength with confidence and widens its uncertainty bounds', () => {
    const estimate = estimateMilitaryStrength([
      observation({
        source: 'remembered',
        confidence: 0.6,
        uncertainty: 0.2,
      }),
    ]);

    expect(estimate.exactVisible).toBe(0);
    expect(estimate.remembered).toBeCloseTo(6);
    expect(estimate.uncertaintyLower).toBeCloseTo(4);
    expect(estimate.uncertaintyUpper).toBeCloseTo(8);
    expect(estimate.midpoint).toBeCloseTo(6);
  });

  it('clamps malformed observation percentages without producing invalid estimates', () => {
    const estimate = estimateMilitaryStrength([
      observation({
        source: 'remembered',
        health: 140,
        experience: -20,
        confidence: Number.POSITIVE_INFINITY,
        uncertainty: -3,
      }),
    ]);

    expect(estimate).toEqual({
      exactVisible: 0,
      remembered: 0,
      uncertaintyLower: 0,
      uncertaintyUpper: 0,
      midpoint: 0,
      observedUnitCount: 0,
      hasUsableObservation: false,
    });
  });

  it('adds a bounded inferred reserve only to the upper uncertainty bound', () => {
    const estimate = estimateMilitaryStrength(
      [observation()],
      { unknownReserveUpper: 8 },
    );

    expect(estimate.exactVisible).toBe(10);
    expect(estimate.uncertaintyLower).toBe(10);
    expect(estimate.uncertaintyUpper).toBe(18);
    expect(estimate.midpoint).toBe(14);
  });

  it('clamps invalid unknown-reserve bounds to zero', () => {
    expect(estimateMilitaryStrength([], { unknownReserveUpper: -10 }))
      .toEqual(estimateMilitaryStrength([]));
    expect(estimateMilitaryStrength([], { unknownReserveUpper: Number.NaN }))
      .toEqual(estimateMilitaryStrength([]));
  });

  it('excludes civilians, recon-only units, cargo or captured units, and unavailable forces', () => {
    const estimate = estimateMilitaryStrength([
      observation({ type: 'worker' }),
      observation({ type: 'settler' }),
      observation({ type: 'scout' }),
      observation({ type: 'warrior', cargoOrCaptured: true }),
      observation({ type: 'swordsman', locallyAvailable: false }),
      observation({ type: 'war_hound' }),
    ]);

    expect(estimate.exactVisible).toBe(12);
    expect(estimate.midpoint).toBe(12);
  });

  it('returns a stable zero estimate for no observations', () => {
    expect(estimateMilitaryStrength([])).toEqual({
      exactVisible: 0,
      remembered: 0,
      uncertaintyLower: 0,
      uncertaintyUpper: 0,
      midpoint: 0,
      observedUnitCount: 0,
      hasUsableObservation: false,
    });
  });

  it('does not count a civilian, spy, scout or observation-only unit as military (#1334)', () => {
    for (const type of ['worker', 'settler', 'spy_scout', 'scout', 'observation_balloon', 'transport'] as const) {
      expect(isMilitaryStrengthUnit(type), type).toBe(false);
      const estimate = estimateMilitaryStrength([observation({ type })]);
      expect(estimate.exactVisible, type).toBe(0);
      expect(estimate.hasUsableObservation, type).toBe(false);
    }
    for (const type of ['warrior', 'archer', 'galley', 'tank', 'jet_fighter', 'catapult'] as const) {
      expect(isMilitaryStrengthUnit(type), type).toBe(true);
    }
  });

  it('keeps "no usable observation" distinct from a measured zero (#1334)', () => {
    const unknown = estimateMilitaryStrength([], { unknownReserveUpper: 8 });
    expect(unknown.hasUsableObservation).toBe(false);
    expect(unknown.uncertaintyUpper).toBe(8);
    const seen = estimateMilitaryStrength([observation()], { unknownReserveUpper: 8 });
    expect(seen.hasUsableObservation).toBe(true);
    expect(seen.observedUnitCount).toBe(1);
  });

  it('stops counting a remembered unit once its confidence has decayed to zero (#1334)', () => {
    const stale = estimateMilitaryStrength([observation({ source: 'remembered', confidence: 0, uncertainty: 1 })]);
    expect(stale.hasUsableObservation).toBe(false);
    expect(stale.remembered).toBe(0);
  });
});
