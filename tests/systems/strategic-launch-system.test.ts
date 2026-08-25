import { describe, it, expect } from 'vitest';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

describe('strategic launch platform wiring (#545)', () => {
  it('missile_silo has unlimited-range strategicLaunchPlatform', () => {
    expect(BUILDINGS.missile_silo.strategicLaunchPlatform).toEqual({ range: 'unlimited' });
  });
});
