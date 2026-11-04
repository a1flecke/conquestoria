import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import * as diplomacyState from '@/systems/diplomacy-state';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { getMinorCivPopulationCeiling } from '@/systems/minor-civ-economy-system';
import { planMinorCivGraduations } from '@/systems/minor-civ-graduation';
import { GRADUATION_MAX_PER_GAME, MINOR_CIV_GRADUATION_TUNING } from '@/systems/minor-civ-graduation-rules';
import { getGraduateCivId } from '@/systems/minor-civ-graduation-conversion';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import { advancePlayerCivToEra, fixturePeacefulIsolated } from '../systems/helpers/minor-civ-scenario-fixtures';

/**
 * #497 PR 3 -- the `minor-civ-graduation` round phase and the graduated civilization's first AI turns.
 *
 * The city-state is made ripe by hand (the way the conversion tests do), and the campaign id is searched for one
 * whose seeded draw succeeds, so the run is deterministic without leaning on a lucky default seed.
 */

const TUNING = MINOR_CIV_GRADUATION_TUNING.standard;
const BUILDING_IDS = ['barracks', 'marketplace', 'library', 'granary', 'walls', 'temple', 'workshop', 'harbor'];
const GRADUATION_TURN = 400;

function ripe(gameId: string): { state: GameState; minorCivId: string } {
  const { state, minorCivId } = fixturePeacefulIsolated('graduation-phase');
  state.gameId = gameId;
  state.opponentChallenge = 'standard';
  state.turn = GRADUATION_TURN;
  advancePlayerCivToEra(state, TUNING.minWorldAge);
  for (const civ of Object.values(state.civilizations)) civ.techState.completed = [...state.civilizations.player.techState.completed];
  const minorCiv = state.minorCivs[minorCivId]!;
  minorCiv.foundedTurn = state.turn - TUNING.minAgeTurns;
  minorCiv.diplomacy.atWarWith = [];
  const city = state.cities[minorCiv.cityId]!;
  city.population = getMinorCivPopulationCeiling(state, minorCivId) - TUNING.populationHeadroom;
  city.buildings = BUILDING_IDS.slice(0, TUNING.minBuildings);
  return { state, minorCivId };
}

/** A ripe state whose planner picks the city-state, found by trying campaign ids in order. */
function ripeAndSelected(enabled: boolean): { state: GameState; minorCivId: string } {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const candidate = ripe(`graduation-phase-${attempt}`);
    candidate.state.settings.cityStateGraduation = enabled ? 'on' : 'off';
    const plan = planMinorCivGraduations(candidate.state);
    if (plan.status === 'evaluated' && plan.selectedMinorCivId === candidate.minorCivId) return candidate;
  }
  throw new Error('no campaign id produced a successful graduation draw');
}

function graduateIds(state: GameState): string[] {
  return Object.keys(state.civilizations).filter(id => state.civilizations[id]!.graduatedFrom !== undefined);
}

afterEach(() => vi.restoreAllMocks());

describe('minor-civ-graduation phase (#497)', () => {
  it('does nothing when the campaign has not opted in, even for a city-state the planner would pick', () => {
    const { state } = ripeAndSelected(false);
    const bus = new EventBus();
    const graduated = vi.fn();
    bus.on('minor-civ:graduated', graduated);
    const next = processTurn(state, bus);
    expect(graduateIds(next)).toEqual([]);
    expect(graduated).not.toHaveBeenCalled();
  });

  it('treats a save that predates the setting as off', () => {
    const { state } = ripeAndSelected(true);
    delete state.settings.cityStateGraduation;
    const next = processTurn(state, new EventBus());
    expect(graduateIds(next)).toEqual([]);
  });

  it('graduates exactly the selected city-state once, announces it once, and keeps every invariant', () => {
    const { state, minorCivId } = ripeAndSelected(true);
    const definitionId = state.minorCivs[minorCivId]!.definitionId;
    const bus = new EventBus();
    const graduated = vi.fn();
    bus.on('minor-civ:graduated', graduated);

    const next = processTurn(state, bus);
    const civId = getGraduateCivId(definitionId);
    expect(graduateIds(next)).toEqual([civId]);
    expect(graduated).toHaveBeenCalledTimes(1);
    expect(graduated).toHaveBeenCalledWith({ minorCivId, civId, definitionId, turn: GRADUATION_TURN });
    expect(next.minorCivs[minorCivId]).toMatchObject({ isDestroyed: true, graduation: { civId } });
    assertSaveStateInvariants(next, 'after the graduation round');
  });

  it('does not graduate off the 50-turn cadence', () => {
    const { state } = ripeAndSelected(true);
    state.turn = GRADUATION_TURN + 1;
    expect(graduateIds(processTurn(state, new EventBus()))).toEqual([]);
  });

  it('visits the new civilization exactly once per round: not in its graduation round, once in each later one', () => {
    const { state } = ripeAndSelected(true);
    const drift = vi.spyOn(diplomacyState, 'processRelationshipDrift');
    const civCountBefore = Object.keys(state.civilizations).length;

    const bus = new EventBus();
    const afterGraduation = processTurn(state, bus);
    expect(drift).toHaveBeenCalledTimes(civCountBefore);

    drift.mockClear();
    processTurn(afterGraduation, bus);
    expect(drift).toHaveBeenCalledTimes(civCountBefore + 1);
  });

  it('is capped per campaign', () => {
    const { state } = ripeAndSelected(true);
    for (let index = 0; index < GRADUATION_MAX_PER_GAME; index += 1) {
      state.civilizations[`grad-earlier-${index}`] = {
        ...structuredClone(state.civilizations['ai-1']!),
        id: `grad-earlier-${index}`,
        graduatedFrom: { minorCivId: `mc-earlier-${index}`, definitionId: `earlier-${index}`, turn: 100 },
      };
    }
    expect(graduateIds(processTurn(state, new EventBus())).filter(id => !id.startsWith('grad-earlier-'))).toEqual([]);
  });
});

describe('a graduated civilization plays its first rounds as an AI (#497)', () => {
  it('is enrolled by the scheduler, plans and acts every round for 50 rounds, and never throws or breaks an invariant', () => {
    const { state, minorCivId } = ripeAndSelected(true);
    const civId = getGraduateCivId(state.minorCivs[minorCivId]!.definitionId);
    const bus = new EventBus();
    const drift = vi.spyOn(diplomacyState, 'processRelationshipDrift');
    let current = state;
    let plannedRounds = 0;
    let visitedRounds = 0;

    for (let round = 0; round < 50; round += 1) {
      const civsAtStart = Object.keys(current.civilizations).length;
      drift.mockClear();
      const result = runCompletedRound(current, bus, {
        improvements: (s, b) => processImprovementTurns(s, b),
        majors: (s, b) => {
          const processed = processNonHumanMajorRound(s, b);
          expect(processed.planningErrors, `round ${round}`).toEqual([]);
          if (processed.traces.some(trace => trace.actorId === civId)) plannedRounds += 1;
          return processed.state;
        },
        world: (s, b) => processTurn(s, b),
        postprocess: (_before, s) => s,
      });
      if (!result.ok) throw result.error;
      current = result.state;
      expect(drift).toHaveBeenCalledTimes(civsAtStart);
      if (current.civilizations[civId]) visitedRounds += 1;
      assertSaveStateInvariants(current, `round ${round}`);
    }

    expect(current.civilizations[civId]).toBeDefined();
    expect(current.opponentAI?.majorCivs?.[civId]).toBeDefined();
    expect(visitedRounds).toBeGreaterThan(40);
    // The civilization is planned for in every round after its graduation round.
    expect(plannedRounds).toBeGreaterThanOrEqual(visitedRounds - 2);
  }, 120_000);
});
