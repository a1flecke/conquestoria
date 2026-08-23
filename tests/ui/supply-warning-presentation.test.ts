import { describe, expect, it } from 'vitest';
import { presentSupplyWarning } from '@/ui/supply-warning-presentation';

describe('presentSupplyWarning', () => {
  it('formats losing-full as an info-level notification, not a warning', () => {
    const result = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1'], kind: 'losing-full', playAudio: true });
    expect(result.type).toBe('info');
    expect(result.message).toContain('Full Supply');
  });

  it('formats entering-combat-penalty as a warning naming the -10% effect', () => {
    const result = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1'], kind: 'entering-combat-penalty', playAudio: true });
    expect(result.type).toBe('warning');
    expect(result.message).toContain('-10%');
  });

  it('formats entering-movement-penalty as a warning naming the -1 movement effect', () => {
    const result = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1'], kind: 'entering-movement-penalty', playAudio: true });
    expect(result.type).toBe('warning');
    expect(result.message).toContain('Movement');
  });

  it('pluralizes the message when more than one unit is grouped into the warning', () => {
    const single = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1'], kind: 'losing-full', playAudio: true });
    const grouped = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1', 'u2', 'u3'], kind: 'losing-full', playAudio: true });
    expect(single.message).toContain('A unit');
    expect(grouped.message).toContain('3 units');
  });
});
