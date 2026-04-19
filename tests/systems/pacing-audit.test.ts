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

  it('derives later unlock eras from the unlocking tech definitions', () => {
    const rows = buildPacingAudit();
    expect(rows.find(row => row.id === 'walls')?.era).toBe(3);
    expect(rows.find(row => row.id === 'observatory')?.era).toBe(4);
    expect(rows.find(row => row.id === 'musketeer')?.era).toBe(4);
  });

  it('reports recommended cost and outlier signals', () => {
    const row = buildPacingAudit().find(candidate => candidate.id === 'herbalist');
    expect(row).toBeDefined();
    expect(row?.recommendedCost).toBeGreaterThan(0);
    expect(typeof row?.outlier).toBe('boolean');
    expect(typeof row?.outlierReason).toBe('string');
  });

  it('derives meaningful pacing bands for unannotated catalog items instead of defaulting them all to core', () => {
    const rows = buildPacingAudit();

    expect(rows.find(row => row.id === 'granary')?.band).toBe('infrastructure');
    expect(rows.find(row => row.id === 'settler')?.band).toBe('power-spike');
    expect(rows.find(row => row.id === 'banking')?.band).toBe('power-spike');
  });
});
