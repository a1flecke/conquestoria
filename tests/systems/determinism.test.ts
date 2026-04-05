import { describe, it, expect } from 'vitest';
import { createRng } from '@/systems/map-generator';

describe('seeded RNG determinism', () => {
  it('createRng produces same sequence for same seed', () => {
    const rng1 = createRng('test-seed-42');
    const rng2 = createRng('test-seed-42');
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('createRng produces different sequence for different seed', () => {
    const rng1 = createRng('seed-a');
    const rng2 = createRng('seed-b');
    expect(rng1()).not.toBe(rng2());
  });
});
