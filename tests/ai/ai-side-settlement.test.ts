import { describe, expect, it } from 'vitest';
import { planSideSettlementOrder, type SideSettlementWorld } from '@/ai/ai-side-settlement';

const site = { anchor: { q: 6, r: 2 } };

function world(units: SideSettlementWorld['units']): SideSettlementWorld {
  return { civilizations: { 'ai-1': { units: Object.keys(units) } }, units };
}

describe('planSideSettlementOrder (#1693)', () => {
  it('sends the first free settler to the site', () => {
    const order = planSideSettlementOrder(world({
      b: { id: 'b', type: 'settler', position: { q: 0, r: 0 } },
      a: { id: 'a', type: 'settler', position: { q: 1, r: 0 } },
      w: { id: 'w', type: 'warrior', position: { q: 0, r: 0 } },
    }), 'ai-1', site, new Set());
    expect(order).toEqual({ unitId: 'a', destination: site.anchor });
  });

  it('leaves alone a settler that is busy, aboard, automated or already there', () => {
    const order = planSideSettlementOrder(world({
      a: { id: 'a', type: 'settler', position: { q: 0, r: 0 } },
      b: { id: 'b', type: 'settler', position: { q: 0, r: 0 }, transportId: 't' },
      c: { id: 'c', type: 'settler', position: { q: 0, r: 0 }, automation: { mode: 'auto-explore' } },
      d: { id: 'd', type: 'settler', position: { ...site.anchor } },
    }), 'ai-1', site, new Set(['a']));
    expect(order).toBeNull();
  });

  it('sends no second settler while one is already on its way', () => {
    const order = planSideSettlementOrder(world({
      a: { id: 'a', type: 'settler', position: { q: 0, r: 0 }, automation: { mode: 'journey', destination: { q: 9, r: 9 } } },
      b: { id: 'b', type: 'settler', position: { q: 0, r: 0 } },
    }), 'ai-1', site, new Set());
    expect(order).toBeNull();
  });

  it('does nothing without a site', () => {
    expect(planSideSettlementOrder(world({
      a: { id: 'a', type: 'settler', position: { q: 0, r: 0 } },
    }), 'ai-1', null, new Set())).toBeNull();
  });
});
