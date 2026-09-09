import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeCampaign, type CampaignFinding } from './campaign-analysis';
import { writeCampaignArtifacts } from './campaign-report';
import {
  LONG_HORIZON_SCENARIOS,
  runScenario,
  SCENARIO_TIMEOUT_MS,
} from './campaign-scenarios';
import { evaluateGapRatchet } from './known-campaign-gaps';

/**
 * #1005 — the long-horizon deterministic AI campaign matrix.
 *
 * EXPLICIT-RUN ONLY (`yarn test:ai-long`). This file lives under
 * `tests/simulation/long-horizon/`, which `vite.config.ts` excludes
 * unconditionally; only `vitest.long-horizon.config.ts` re-includes it.
 * `tests/scripts/ai-long-horizon-isolation.test.ts` guards that.
 *
 * Every scenario runs a 250-500 turn campaign with the full per-round invariant
 * battery, writes a deterministic report artifact under `.verification/`, and
 * feeds its findings into the two-way known-gap ratchet in `afterAll`:
 *   - a finding not covered by `KNOWN_CAMPAIGN_GAPS` fails the run;
 *   - a declared gap that no longer reproduces fails the run.
 */

const VERIFICATION_DIR = resolve(process.cwd(), '.verification');

const findingsByScenario = new Map<string, CampaignFinding[]>();

describe('long-horizon campaign matrix', () => {
  it.each(LONG_HORIZON_SCENARIOS.map(scenario => [scenario.seed, scenario] as const))(
    '%s completes a deterministic campaign within the invariant battery',
    (seed, scenario) => {
      const run = runScenario(scenario);
      const report = analyzeCampaign(run.samples);
      writeCampaignArtifacts(VERIFICATION_DIR, run);
      findingsByScenario.set(seed, report.findings);

      // Basic liveness of the RUN itself (not the AI): a campaign that produced
      // no samples, or terminated on turn 1, means the harness broke.
      expect(run.samples.length).toBeGreaterThan(10);
      expect(report.summary.rounds).toBe(run.samples.length);
      expect(report.summary.lastTurn).toBeGreaterThan(run.samples[0]!.turn);
      // stopOnGameOver campaigns either ran the cap or ended on a real victory.
      if (run.termination.reason === 'victory') {
        expect(run.termination.gameOverReason).toBeTruthy();
        expect(report.summary.terminated).toBe(true);
      } else {
        expect(run.termination.roundsCompleted).toBe(scenario.turns);
      }
      // At least one AI must still be a living actor at the end — a matrix
      // scenario where every AI is dead is not exercising the AI.
      const livingAi = report.perCiv.filter(c => !c.isHuman && c.living);
      expect(livingAi.length).toBeGreaterThan(0);
    },
    SCENARIO_TIMEOUT_MS,
  );
});

afterAll(() => {
  // Only enforce the ratchet if every scenario actually ran (a filtered `-t`
  // invocation legitimately runs a subset — don't fail its `afterAll`).
  if (findingsByScenario.size !== LONG_HORIZON_SCENARIOS.length) return;

  const { unknownFindings, staleGaps } = evaluateGapRatchet(findingsByScenario);

  expect(
    unknownFindings,
    `Long-horizon campaigns produced findings with no KNOWN_CAMPAIGN_GAPS entry.\n`
      + `Either this is a NEW regression to fix, or add a register entry citing a follow-up issue:\n`
      + unknownFindings.map(f => `  - [${f.scenario}] ${f.code}: ${f.detail}`).join('\n'),
  ).toEqual([]);

  expect(
    staleGaps,
    `KNOWN_CAMPAIGN_GAPS entries no longer reproduce in any of their scenarios.\n`
      + `The underlying bug is fixed — DELETE these entries:\n`
      + staleGaps.map(g => `  - ${g.code} (${g.issue}): ${g.why}`).join('\n'),
  ).toEqual([]);
});
