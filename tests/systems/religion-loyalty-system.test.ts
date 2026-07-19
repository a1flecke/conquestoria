import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { CityFaith, GameEvents } from '@/core/types';

describe('#593 MR6 — CityFaith.loyaltyProgress type', () => {
  it('accepts a loyaltyProgress record shape', () => {
    const faith: CityFaith = { religionId: 'religion-p1', loyaltyProgress: { toCivId: 'p2', points: 30 } };
    expect(faith.loyaltyProgress).toEqual({ toCivId: 'p2', points: 30 });
  });

  it('emits religion:loyalty-warning and religion:city-defected with the expected payload shape', () => {
    const bus = new EventBus();
    const warnings: GameEvents['religion:loyalty-warning'][] = [];
    const defections: GameEvents['religion:city-defected'][] = [];
    bus.on('religion:loyalty-warning', e => warnings.push(e));
    bus.on('religion:city-defected', e => defections.push(e));
    bus.emit('religion:loyalty-warning', { cityId: 'c1', pressuringCivId: 'p2', stage: 'start', turnsRemaining: 18 });
    bus.emit('religion:city-defected', { cityId: 'c1', fromCivId: 'p1', toCivId: 'p2' });
    expect(warnings).toHaveLength(1);
    expect(defections).toHaveLength(1);
  });
});
