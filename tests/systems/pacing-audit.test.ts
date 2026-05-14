import { describe, expect, it } from 'vitest';
import { buildPacingAudit } from '@/systems/pacing-audit';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';

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

  it('audits every current building and trainable unit exactly once', () => {
    const productionRows = buildPacingAudit({ era: 1 })
      .filter(row => row.contentType === 'building' || row.contentType === 'unit');
    const actualIds = productionRows.map(row => row.id).sort();
    const expectedIds = [
      ...Object.keys(BUILDINGS),
      ...TRAINABLE_UNITS.map(unit => unit.type),
    ].sort();

    expect(actualIds).toEqual(expectedIds);
  });

  it('reports Settler cost using the requested audit era', () => {
    const era1Settler = buildPacingAudit({ era: 1 }).find(row => row.id === 'settler');
    const era4Settler = buildPacingAudit({ era: 4 }).find(row => row.id === 'settler');

    expect(era1Settler?.currentCost).toBe(24);
    expect(era1Settler?.estimatedTurns).toBe(6);
    expect(era4Settler?.currentCost).toBe(48);
    expect(era4Settler?.estimatedTurns).toBe(5);
  });

  it('has no slower-than-target building or unit outliers after the catalog audit pass', () => {
    const slowOutliers = buildPacingAudit({ era: 1 })
      .filter(row => row.contentType === 'building' || row.contentType === 'unit')
      .filter(row => row.estimatedTurns > row.target.max)
      .map(row => `${row.id}:${row.estimatedTurns}/${row.target.max}`);

    expect(slowOutliers).toEqual([]);
  });
});

describe('tech pacing audit', () => {
  it('reports research profile and live baseline fields for tech rows', () => {
    const bronze = buildPacingAudit().find(row => row.id === 'bronze-working');

    expect(bronze).toBeDefined();
    expect(bronze?.contentType).toBe('tech');
    expect(bronze?.researchProfile).toBe('opening-baseline');
    expect(bronze?.liveBaselineTurns).toBe(bronze?.estimatedTurns);
    expect(bronze?.liveBaselineTurns).toBeGreaterThan(11);
    expect(bronze?.recommendedCost).toBeGreaterThan(0);
  });

  it('flags current Bronze Working as a slow opening outlier before the retune', () => {
    const bronze = buildPacingAudit().find(row => row.id === 'bronze-working');

    expect(bronze?.estimatedTurns).toBe(50);
    expect(bronze?.target).toEqual({ min: 9, max: 11 });
    expect(bronze?.outlier).toBe(true);
    expect(bronze?.outlierReason).toBe('Slower than target window');
  });
});
