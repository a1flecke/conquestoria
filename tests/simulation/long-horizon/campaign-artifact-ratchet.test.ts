import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LONG_HORIZON_SCENARIOS } from './campaign-scenarios';
import {
  evaluateGapRatchet,
  findInvalidGapRegistrations,
  type RatchetFinding,
} from './known-campaign-gaps';

/**
 * #1454: evaluate the known-gap ratchet over the deterministic artifacts of a finished matrix, without re-running it.
 *
 * `campaign-matrix.test.ts` only enforces the ratchet when ONE vitest invocation ran every scenario, but on a busy
 * host the whole matrix (~3 hours) exceeds `run-ai-long-horizon.sh`'s outer cap, so it is run in pieces
 * (`yarn test:ai-long -t <seed>`) and the in-test ratchet never fires. The per-scenario JSON each piece writes is
 * byte-deterministic for a given seed and commit, so the ratchet can be evaluated from those files afterwards.
 *
 * Opt-in (`CAMPAIGN_RATCHET_FROM_ARTIFACTS=1`) because it must only read artifacts a finished run left behind: the
 * long-horizon config would otherwise start it concurrently with the matrix, which is still writing them.
 *
 *   CAMPAIGN_RATCHET_FROM_ARTIFACTS=1 ./scripts/run-with-mise.sh yarn vitest run \
 *     --config vitest.long-horizon.config.ts tests/simulation/long-horizon/campaign-artifact-ratchet.test.ts
 */

const ARTIFACT_DIR = resolve(process.cwd(), '.verification/ai-long-horizon');

interface Artifact { report: { findings: RatchetFinding[] } }

describe.skipIf(!process.env.CAMPAIGN_RATCHET_FROM_ARTIFACTS)('known-gap ratchet over saved matrix artifacts (#1454)', () => {
  it('every scenario has an artifact', () => {
    const missing = LONG_HORIZON_SCENARIOS.filter(s => !existsSync(resolve(ARTIFACT_DIR, `${s.seed}.json`))).map(s => s.seed);
    expect(missing, 'run the missing scenarios first (yarn test:ai-long -t <seed>)').toEqual([]);
  });

  it('the register is well-formed and the ratchet is clean in both directions', () => {
    const findingsByScenario = new Map<string, RatchetFinding[]>();
    for (const scenario of LONG_HORIZON_SCENARIOS) {
      const artifact = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, `${scenario.seed}.json`), 'utf8')) as Artifact;
      findingsByScenario.set(scenario.seed, artifact.report.findings);
    }
    expect(findInvalidGapRegistrations()).toEqual([]);
    const { unknownFindings, staleGaps, staleOccurrences } = evaluateGapRatchet(findingsByScenario);
    expect(unknownFindings).toEqual([]);
    expect(staleGaps.map(g => `${g.code} ${g.issue}`)).toEqual([]);
    expect(staleOccurrences.map(s => `${s.gap.code} ${s.occurrence.scenario}/${s.occurrence.civId}`)).toEqual([]);
  });
});
