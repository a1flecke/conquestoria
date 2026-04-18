import { describe, expect, it } from 'vitest';
import { buildPacingAudit } from '@/systems/pacing-audit';

describe('pacing-audit', () => {
  it('returns audit rows for current techs, units, and buildings', () => {
    const rows = buildPacingAudit();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(row => row.id === 'warrior')).toBe(true);
    expect(rows.some(row => row.id === 'fire')).toBe(true);
    expect(rows.some(row => row.id === 'workshop')).toBe(true);
  });
});
