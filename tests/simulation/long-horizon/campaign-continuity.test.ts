import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstSimulationDivergence } from '../../helpers/deterministic-state';
import {
  buildDeterministicArtifact,
  serializeDeterministicArtifact,
  writeCampaignArtifacts,
} from './campaign-report';
import { runScenario, scenarioBySeed, SCENARIO_TIMEOUT_MS } from './campaign-scenarios';

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
    // #1064 note: this test can now legitimately fail on `lh-standard-medium` (and
    // potentially other scenarios) with a divergence path OTHER than F2 -- e.g.
    // `civilizations.<id>.gold` -- once AI civs actually expand to multiple, possibly
    // border-contested cities. That failure is issue #1092, NOT a regression in #1064's
    // own changes: `normalizeLoadedState` (src/storage/save-manager.ts) calls
    // `recalculateTerritory` with `preserveForeignHolders: true` on every load, while the
    // live per-round call in turn-manager.ts does not pass that flag, so a border tile
    // that would legitimately change hands under ordinary `'turn'` recompute instead
    // freezes to its previous owner if a save/reload happens near that transition.
    // Confirmed via bisection (removing #1064's exploration mechanism makes the
    // divergence disappear) and via a raw parse+normalizeLoadedState round-trip with no
    // further simulation (already diverges at `cities.<id>.ownedTiles.length`). This is a
    // pre-existing gap in `city-territory-system.ts`'s load/live asymmetry -- unreachable
    // before #1064 because no AI civ ever had a close, contested neighbor. See #1092 for
    // the full mechanism and why a real fix needs its own careful design (a minimal
    // change to `preserveForeignHolders` breaks the corruption-repair case it was added
    // for -- `tests/storage/save-persistence.test.ts`'s "preserves legacy tile owner..."
    // test). Deliberately NOT added to `isKnownSaveReloadDivergence`: unlike F2 (a single
    // inert field), this divergence's downstream symptom is unbounded (gold, population,
    // anything fed by which city owns a tile), so a blanket tolerance would defeat the
    // point of this test. Left as an honest, informative failure until #1092 lands.
    'save/reload mid-campaign continues equivalently',
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

      expect(
        divergence,
        `save/reload must preserve authoritative state exactly (divergence: ${divergence})`,
      ).toBeNull();
    },
    SCENARIO_TIMEOUT_MS * 2,
  );
});
