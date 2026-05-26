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

export function assignLegendaryWonderSlots(inputs: LegendaryWonderSlotInput[], turn = 0): LegendaryWonderSlot[] {
  const sorted = [...inputs].sort((a, b) => a.turnCompleted - b.turnCompleted || a.wonderId.localeCompare(b.wonderId));
  if (sorted.length <= 6) {
    return sorted.slice(0, 6).map((input, index) => ({
      kind: 'landmark',
      wonderId: input.wonderId,
      turnCompleted: input.turnCompleted,
      slotIndex: index,
      ...OFFSETS[index],
    }));
  }

  const windowStart = Math.floor(turn / 5) % sorted.length;
  const visible = Array.from({ length: 5 }, (_, index) => sorted[(windowStart + index) % sorted.length]);
  const slots: LegendaryWonderSlot[] = visible.map((input, index) => ({
    kind: 'landmark',
    wonderId: input.wonderId,
    turnCompleted: input.turnCompleted,
    slotIndex: index,
    ...OFFSETS[index],
  }));
  slots.push({ kind: 'overflow', slotIndex: 5, overflowCount: sorted.length - 5, ...OFFSETS[5] });
  return slots;
}
