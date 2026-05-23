import { describe, expect, it } from 'vitest';
import { assignLegendaryWonderSlots } from '@/renderer/wonders/legendary-wonder-slots';

describe('legendary-wonder-slots', () => {
  it('assigns stable slots sorted by turnCompleted then wonderId', () => {
    const slots = assignLegendaryWonderSlots([
      { wonderId: 'sun-spire', turnCompleted: 12 },
      { wonderId: 'oracle-of-delphi', turnCompleted: 10 },
      { wonderId: 'grand-canal', turnCompleted: 10 },
    ]);

    expect(slots.map(slot => slot.kind === 'landmark' ? slot.wonderId : 'overflow')).toEqual([
      'grand-canal',
      'oracle-of-delphi',
      'sun-spire',
    ]);
    expect(slots.map(slot => slot.slotIndex)).toEqual([0, 1, 2]);
  });

  it('uses first five plus overflow when more than six wonders are visible', () => {
    const slots = assignLegendaryWonderSlots([
      'a', 'b', 'c', 'd', 'e', 'f', 'g',
    ].map((wonderId, index) => ({ wonderId, turnCompleted: index + 1 })));

    expect(slots).toHaveLength(6);
    expect(slots[5]).toMatchObject({ kind: 'overflow', overflowCount: 2 });
  });
});
