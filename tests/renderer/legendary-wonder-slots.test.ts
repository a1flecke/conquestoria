import { describe, expect, it } from 'vitest';
import { assignLegendaryWonderSlots } from '@/renderer/wonders/legendary-wonder-slots';

describe('legendary wonder slots', () => {
  it('rotates overflow windows every five turns while keeping a stable overflow count', () => {
    const entries = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((wonderId, index) => ({
      wonderId,
      turnCompleted: index + 1,
    }));

    expect(assignLegendaryWonderSlots(entries, 4).filter(slot => slot.kind === 'landmark').map(slot => slot.wonderId))
      .toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(assignLegendaryWonderSlots(entries, 5).filter(slot => slot.kind === 'landmark').map(slot => slot.wonderId))
      .toEqual(['b', 'c', 'd', 'e', 'f']);
    expect(assignLegendaryWonderSlots(entries, 10).filter(slot => slot.kind === 'landmark').map(slot => slot.wonderId))
      .toEqual(['c', 'd', 'e', 'f', 'g']);
    expect(assignLegendaryWonderSlots(entries, 10).find(slot => slot.kind === 'overflow')).toMatchObject({
      kind: 'overflow',
      overflowCount: 3,
    });
  });
});
