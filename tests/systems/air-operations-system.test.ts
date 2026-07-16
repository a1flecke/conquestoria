import { describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { TRAINABLE_UNITS } from '@/systems/city-system';

describe('air-operation definitions', () => {
  it('gives every based aircraft its approved base, range, and mission contract', () => {
    expect((UNIT_DEFINITIONS.biplane as any).airOperation).toEqual({
      baseKinds: ['airfield', 'carrier'], operationalRange: 3, ferryRange: 6,
      missions: ['strike', 'intercept', 'rebase'], carrierEligible: true,
    });
    expect((UNIT_DEFINITIONS.attack_helicopter as any).airOperation).toMatchObject({
      baseKinds: ['helicopter_base'], operationalRange: 4, ferryRange: 8,
      missions: ['strike', 'rebase'], carrierEligible: false,
    });
    expect((UNIT_DEFINITIONS.jet_fighter as any).airOperation).toMatchObject({ operationalRange: 5, ferryRange: 10 });
    expect((UNIT_DEFINITIONS.bomber as any).airOperation).toMatchObject({ operationalRange: 6, ferryRange: 12 });
    expect((UNIT_DEFINITIONS.stealth_bomber as any).airOperation).toMatchObject({ operationalRange: 7, ferryRange: 14 });
  });

  it('adds the modern Recon Aircraft to the trainable roster at Jet Aviation', () => {
    expect((UNIT_DEFINITIONS as any).recon_aircraft).toMatchObject({
      domain: 'air', strength: 0,
      airOperation: {
        baseKinds: ['airfield'], operationalRange: 5, ferryRange: 10,
        missions: ['recon', 'rebase'], carrierEligible: false,
      },
    });
    expect(TRAINABLE_UNITS.find(unit => unit.type === ('recon_aircraft' as any))).toMatchObject({
      techRequired: 'jet-aviation',
    });
  });
});
