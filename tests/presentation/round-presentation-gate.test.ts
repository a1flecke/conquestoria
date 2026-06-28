import { describe, expect, it } from 'vitest';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';

describe('RoundPresentationGate', () => {
  it('requires every nested suppression to resume before presentation is released', () => {
    const gate = new RoundPresentationGate();
    gate.suppress();
    gate.suppress();
    gate.resume();
    expect(gate.isSuppressed()).toBe(true);
    expect(gate.suppressionDepth).toBe(1);
    gate.resume();
    gate.resume();
    expect(gate.isSuppressed()).toBe(false);
    expect(gate.suppressionDepth).toBe(0);
  });
});
