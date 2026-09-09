import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstSimulationDivergence } from '../../helpers/deterministic-state';
import {
  buildDeterministicArtifact,
  serializeDeterministicArtifact,
  writeCampaignArtifacts,
} from './campaign-report';
import { runScenario, scenarioBySeed, SCENARIO_TIMEOUT_MS } from './campaign-scenarios';
import { F2_SAVE_RELOAD_ISSUE, isKnownSaveReloadDivergence } from './known-campaign-gaps';

/**
 * #1005 — determinism and save/reload continuity for long campaigns.
 *
 * Separate file from the matrix so Vitest can run the two concurrently under
 * `vitest.long-horizon.config.ts` (the only config that sees this directory).
 */

const VERIFICATION_DIR = resolve(process.cwd(), '.verification');

describe('long-horizon determinism', () => {
  it(
    'a full campaign is byte-identical across two runs of the same seed',
    () => {
      const scenario = scenarioBySeed('lh-explorer-small');
      const a = runScenario(scenario);
      const b = runScenario(scenario);

      // The deterministic report artifact — config, analysis, decimated series —
      // must serialize identically. This is what makes "did this change move the
      // AI?" answerable by diffing `.verification/ai-long-horizon/<seed>.json`.
      expect(serializeDeterministicArtifact(buildDeterministicArtifact(a)))
        .toBe(serializeDeterministicArtifact(buildDeterministicArtifact(b)));

      // And the underlying simulation state itself did not diverge anywhere.
      expect(firstSimulationDivergence(a.finalState, b.finalState)).toBeNull();
    },
    SCENARIO_TIMEOUT_MS * 2,
  );

  it(
    'stopOnGameOver is inert on a campaign that never ends early',
    () => {
      // Guards the campaign-only option: with no victory, the loop, its
      // per-round invariants, and the final state must be identical whether
      // stopOnGameOver is set or not.
      const scenario = { ...scenarioBySeed('lh-explorer-small'), turns: 15 };
      const withFlag = runScenario({ ...scenario, stopOnGameOver: true });
      const withoutFlag = runScenario({ ...scenario, stopOnGameOver: false });

      expect(withFlag.termination.reason).toBe('turn-cap');
      expect(withFlag.termination.roundsCompleted).toBe(15);
      expect(firstSimulationDivergence(withFlag.finalState, withoutFlag.finalState)).toBeNull();
    },
    SCENARIO_TIMEOUT_MS,
  );
});

describe('long-horizon save/reload continuity', () => {
  it(
    'save/reload mid-campaign continues equivalently, save for the known F2 divergence',
    () => {
      const scenario = scenarioBySeed('lh-standard-medium');
      const uninterrupted = runScenario(scenario);
      const continued = runScenario(scenario, { saveReloadAfterRounds: [150, 300] });

      // Distinct artifact name so this never races the matrix's own
      // `lh-standard-medium.json` (both files, different Vitest workers).
      writeCampaignArtifacts(VERIFICATION_DIR, {
        ...continued,
        scenario: { ...continued.scenario, seed: `${continued.scenario.seed}-savereload` },
      });
      expect(continued.saveReloadRounds).toEqual([150, 300]);

      const divergence = firstSimulationDivergence(
        continued.finalState,
        uninterrupted.finalState,
      );

      // Two-way ratchet, mirroring KNOWN_CAMPAIGN_GAPS:
      //  - a divergence at any path OTHER than F2's
      //    (`minorCivs.<id>.lastNotifiedStatusByCiv.*`) is a NEW save/reload
      //    correctness bug and fails here;
      //  - F2 currently DOES reproduce on this scenario, so `null` also fails,
      //    telling you the normalizer bug is fixed and this whole test plus
      //    `isKnownSaveReloadDivergence` and `F2_SAVE_RELOAD_ISSUE` should be
      //    deleted.
      // Do not weaken this to `divergence === null || isKnown(...)`.
      expect(
        divergence,
        `save/reload diverged at an UNEXPECTED path (only F2 is tolerated — see `
          + `${F2_SAVE_RELOAD_ISSUE}): ${divergence}`,
      ).not.toBeNull();
      expect(
        isKnownSaveReloadDivergence(divergence),
        `F2 no longer reproduces (divergence: ${divergence ?? 'null'}). If the `
          + `minor-civ lastNotifiedStatusByCiv normalizer bug is fixed, delete this `
          + `test, isKnownSaveReloadDivergence and F2_SAVE_RELOAD_ISSUE.`,
      ).toBe(true);
    },
    SCENARIO_TIMEOUT_MS * 2,
  );
});
