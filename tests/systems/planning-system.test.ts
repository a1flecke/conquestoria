import { describe, expect, it } from 'vitest';
import { enqueueCityProduction, moveQueuedId, removeQueuedId } from '@/systems/planning-system';

describe('planning-system city queues', () => {
  it('appends new city builds up to a limit of three', () => {
    const city = { productionQueue: ['warrior'] } as any;
    const queued = enqueueCityProduction(city, 'shrine');
    expect(queued.productionQueue).toEqual(['warrior', 'shrine']);
  });

  it('reorders queue items without dropping them', () => {
    expect(moveQueuedId(['warrior', 'shrine', 'worker'], 2, 0)).toEqual(['worker', 'warrior', 'shrine']);
  });

  it('removes queue items cleanly', () => {
    expect(removeQueuedId(['warrior', 'shrine', 'worker'], 1)).toEqual(['warrior', 'worker']);
  });
});
