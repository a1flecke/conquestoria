import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { GameState, OpponentChallenge } from '@/core/types';
import { getDominationProgress, checkDominationVictory } from '@/systems/victory-system';
import { graduateMinorCiv } from '@/systems/minor-civ-graduation-conversion';
import {
  GRADUATION_CADENCE_TURNS,
  GRADUATION_MAX_PER_GAME,
  MINOR_CIV_GRADUATION_TUNING,
} from '@/systems/minor-civ-graduation-rules';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { simTimeout } from '../helpers/sim-timeout';
import { ripeGraduationState } from '../helpers/graduation-fixture';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import { advancePlayerCivToEra } from '../systems/helpers/minor-civ-scenario-fixtures';

/**
 * #497 PR 7 -- campaign validation of city-state graduation with the opt-in flag ON.
 *
 * Graduation is rare by design. This runs the real `processTurn` path with `cityStateGraduation: 'on'` over many
 * campaign seeds in every challenge tier and measures how often a city-state actually graduates, so the provisional
 * numbers in MINOR_CIV_GRADUATION_TUNING are judged against evidence rather than a feeling. Nothing here plays the
 * civilizations (the world is idle), so the counts are a property of the gates and the draw, not of an AI economy.
 *
 * The asserted envelope is deliberately wide: it pins the invariants that must hold at any tuning (at most one per
 * cadence turn, never beyond the per-game cap, every state valid every round, same seed -> same result). The measured
 * rates are reported, not asserted, because the owner approves the final numbers (decision D6).
 * Set GRADUATION_CAMPAIGN_REPORT=<file path> to write the measured table.
 */

const TIERS: readonly OpponentChallenge[] = ['explorer', 'standard', 'veteran'];
const SEEDS_PER_TIER = 6;
const TURNS = 260;
const MATURE_ERA = 5;
// Solo: ~1.5 s per 260-turn seed x 18 seeds, plus a determinism rerun of one; simTimeout applies the shared loaded-host factor.
const CAMPAIGN_TIMEOUT_MS = simTimeout(45_000);

interface CampaignResult {
  graduationTurns: number[];
  graduateIds: string[];
}

/** One idle 260-round campaign: a peaceful city-state in a mature world, opted in, stepped by the real round path. */
function runCampaign(tier: OpponentChallenge, seed: number): CampaignResult {
  const { state: ripe } = ripeGraduationState(`graduation-campaign-${tier}-${seed}`);
  let state: GameState = ripe;
  state.opponentChallenge = tier;
  state.settings.cityStateGraduation = 'on';
  state.turn = 1;
  const city = state.cities[Object.values(state.minorCivs)[0]!.cityId]!;
  const minorCiv = Object.values(state.minorCivs)[0]!;
  // Ripe at the tier's own thresholds, as a campaign that played to the first cadence turn would have made it.
  const tuning = MINOR_CIV_GRADUATION_TUNING[tier];
  minorCiv.foundedTurn = 1;
  city.buildings = ['barracks', 'marketplace', 'library', 'granary', 'walls', 'temple', 'workshop', 'harbor'].slice(0, tuning.minBuildings);
  advancePlayerCivToEra(state, Math.max(MATURE_ERA, tuning.minWorldAge));
  for (const civ of Object.values(state.civilizations)) civ.techState.completed = [...state.civilizations.player.techState.completed];
  expect(resolveCivilizationEra(state.civilizations.player.techState.completed)).toBeGreaterThanOrEqual(tuning.minWorldAge);

  const bus = new EventBus();
  const graduationTurns: number[] = [];
  for (let round = 0; round < TURNS; round += 1) {
    const before = Object.values(state.civilizations).filter(civ => civ.graduatedFrom).length;
    state = processTurn(state, bus);
    const after = Object.values(state.civilizations).filter(civ => civ.graduatedFrom).length;
    expect(after - before, `round ${round}: more than one graduation in a round`).toBeLessThanOrEqual(1);
    if (after > before) {
      // A graduation only ever happens on a cadence turn (the phase runs on the turn that just finished).
      graduationTurns.push(state.turn - 1);
      expect((state.turn - 1) % GRADUATION_CADENCE_TURNS).toBe(0);
    }
    assertSaveStateInvariants(state, `${tier} seed ${seed} round ${round}`);
  }
  return {
    graduationTurns,
    graduateIds: Object.keys(state.civilizations).filter(id => state.civilizations[id]!.graduatedFrom),
  };
}

describe('#497 PR 7 -- graduation over many campaigns with the flag on', () => {
  const measured: Record<string, { campaigns: number; graduated: number; firstTurns: number[] }> = {};

  for (const tier of TIERS) {
    it(`${tier}: never exceeds the cap, one per cadence turn, every state valid`, () => {
      const results = Array.from({ length: SEEDS_PER_TIER }, (_, seed) => runCampaign(tier, seed));
      for (const result of results) {
        expect(result.graduateIds.length).toBeLessThanOrEqual(GRADUATION_MAX_PER_GAME);
        expect(new Set(result.graduationTurns).size).toBe(result.graduationTurns.length);
      }
      measured[tier] = {
        campaigns: results.length,
        graduated: results.reduce((total, result) => total + result.graduateIds.length, 0),
        firstTurns: results.flatMap(result => result.graduationTurns.slice(0, 1)),
      };
    }, CAMPAIGN_TIMEOUT_MS);
  }

  it('is deterministic: the same seed graduates the same city-state on the same turn', () => {
    const first = runCampaign('standard', 0);
    const second = runCampaign('standard', 0);
    expect(second).toEqual(first);
  }, CAMPAIGN_TIMEOUT_MS);

  it('reports the measured graduation rate per tier (set GRADUATION_CAMPAIGN_REPORT=<file path> to write it)', () => {
    const reportPath = process.env.GRADUATION_CAMPAIGN_REPORT;
    if (reportPath) writeFileSync(reportPath, `${JSON.stringify(measured, null, 1)}\n`);
    expect(Object.keys(measured).sort()).toEqual([...TIERS].sort());
  });
});

describe('#497 PR 7 -- Domination with a graduated civilization', () => {
  function graduatedWorld(): { before: GameState; after: GameState; civId: string } {
    const { state, minorCivId } = ripeGraduationState('graduation-domination');
    const result = graduateMinorCiv(state, minorCivId);
    if (!result.ok) throw new Error(`conversion refused: ${result.reason}`);
    return { before: state, after: result.state, civId: result.transition.civId };
  }

  it('counts the graduate as a living independent rival, so it can never be skipped over', () => {
    const { before, after, civId } = graduatedWorld();
    const progressBefore = getDominationProgress(before, 'player');
    const progressAfter = getDominationProgress(after, 'player');
    expect(progressBefore.unresolvedRivalIds).not.toContain(civId);
    expect(progressAfter.rivalCount).toBe(progressBefore.rivalCount + 1);
    expect(progressAfter.unresolvedRivalIds).toContain(civId);
    expect(progressAfter.conditionMet).toBe(false);
  });

  it('does not hand anyone a Domination victory only because a city-state graduated', () => {
    const { before, after } = graduatedWorld();
    expect(checkDominationVictory(before)).toBeNull();
    expect(checkDominationVictory(after)).toBeNull();
  });

  it('the graduate itself is a contender whose own progress starts with no rival secured', () => {
    const { after, civId } = graduatedWorld();
    const progress = getDominationProgress(after, civId);
    expect(progress.contenderId).toBe(civId);
    expect(progress.securedRivalCount).toBe(0);
    expect(progress.conditionMet).toBe(false);
  });
});
