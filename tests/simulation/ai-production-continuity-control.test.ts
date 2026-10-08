import { describe, expect, it, vi } from 'vitest';

// Earned control: switch the fallback OFF (setIdleProduction becomes the identity, i.e. pre-fix behaviour) and show
// the evidence changes. A detector that reports the same thing with or without the behaviour would be worthless.
vi.mock('@/systems/planning-system', async importOriginal => {
  const actual = await importOriginal<typeof import('@/systems/planning-system')>();
  return { ...actual, setIdleProduction: <T>(city: T) => city };
});

import { formatContinuityReport, summarizeProductionContinuity } from './ai-production-continuity';
import { runContinuityCampaign } from './ai-production-continuity-campaign';

describe('AI production continuity evidence: fallback disabled control', () => {
  it('reports no conversion and strictly more wasted output than the real behaviour would', () => {
    const evidence = summarizeProductionContinuity(runContinuityCampaign());
    expect(evidence.reduce((sum, e) => sum + e.convertingCityRounds, 0)).toBe(0);
    expect(evidence.reduce((sum, e) => sum + e.wastedCityRounds, 0)).toBeGreaterThan(0);
    if (process.env.CONTINUITY_REPORT === '1') {
      throw new Error(`\n${formatContinuityReport('fallback disabled (pre-fix)', evidence)}`);
    }
  }, 60_000);
});
