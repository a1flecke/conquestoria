import { describe, it, expect } from 'vitest';
import { getResourceEffectLabel } from '@/systems/resource-definitions';

describe('getResourceEffectLabel (#552)', () => {
  it('describes happiness effects as empire-wide', () => {
    expect(getResourceEffectLabel({ type: 'happiness', amount: 1 })).toContain('all your cities');
  });

  it('describes yield effects as tile-scoped', () => {
    expect(getResourceEffectLabel({ type: 'gold', amount: 1 })).toBe('+1 gold/turn on the worked tile');
    expect(getResourceEffectLabel({ type: 'production', amount: 1 })).toBe('+1 production/turn on the worked tile');
    expect(getResourceEffectLabel({ type: 'food', amount: 1 })).toBe('+1 food/turn on the worked tile');
    expect(getResourceEffectLabel({ type: 'science', amount: 1 })).toBe('+1 science/turn on the worked tile');
  });

  it('returns empty string for null effect', () => {
    expect(getResourceEffectLabel(null)).toBe('');
  });
});
