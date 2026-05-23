export interface LegendaryWonderSlotInput {
  wonderId: string;
  turnCompleted: number;
}

export type LegendaryWonderSlot =
  | { kind: 'landmark'; wonderId: string; turnCompleted: number; slotIndex: number; dx: number; dy: number }
  | { kind: 'overflow'; slotIndex: number; overflowCount: number; dx: number; dy: number };

const OFFSETS = [
  { dx: 0, dy: -0.78 },
  { dx: 0.66, dy: -0.38 },
  { dx: 0.66, dy: 0.34 },
  { dx: 0, dy: 0.74 },
  { dx: -0.66, dy: 0.34 },
  { dx: -0.66, dy: -0.38 },
];

export function assignLegendaryWonderSlots(inputs: LegendaryWonderSlotInput[]): LegendaryWonderSlot[] {
  const sorted = [...inputs].sort((a, b) => a.turnCompleted - b.turnCompleted || a.wonderId.localeCompare(b.wonderId));
  const visible = sorted.length > 6 ? sorted.slice(0, 5) : sorted.slice(0, 6);
  const slots: LegendaryWonderSlot[] = visible.map((input, index) => ({
    kind: 'landmark',
    wonderId: input.wonderId,
    turnCompleted: input.turnCompleted,
    slotIndex: index,
    ...OFFSETS[index],
  }));
  if (sorted.length > 6) {
    slots.push({ kind: 'overflow', slotIndex: 5, overflowCount: sorted.length - 5, ...OFFSETS[5] });
  }
  return slots;
}
