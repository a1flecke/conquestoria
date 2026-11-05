import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { getGraduateCivId } from '@/systems/minor-civ-graduation-conversion';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { ripeAndSelectedGraduationState } from '../helpers/graduation-fixture';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import { simTimeout } from '../helpers/sim-timeout';

/**
 * #497 PR 5 -- a campaign that graduates a city-state survives save and reload on either side of the graduation turn.
 *
 * Contract 2 of the determinism rules (run N, save, load, continue M equals an uninterrupted N+M run) is checked here
 * across the one transition that adds a civilization mid-game. The save goes through the real file path
 * (serialize, parse, migrate, normalize), not `structuredClone`.
 */

// Solo: ~1-2 s per case (a handful of full rounds each); simTimeout applies the shared loaded-host factor.
const TIMEOUT_MS = simTimeout(6000);

function advanceRound(state: GameState): GameState {
  const result = runCompletedRound(state, new EventBus(), {
    improvements: (s, b) => processImprovementTurns(s, b),
    majors: (s, b) => processNonHumanMajorRound(s, b).state,
    world: (s, b) => processTurn(s, b),
    postprocess: (before, s, b) => applyStrategicWarningTransitions(before, s, b),
  });
  if (!result.ok) throw result.error;
  return result.state;
}

function advance(state: GameState, rounds: number): GameState {
  let current = state;
  for (let index = 0; index < rounds; index += 1) current = advanceRound(current);
  return current;
}

function saveAndReload(state: GameState): GameState {
  const parsed = parseSaveFile(serializeSaveFile(state));
  if (parsed.status !== 'success') throw new Error(`save file did not round-trip: ${parsed.message}`);
  return normalizeLoadedState(parsed.state);
}

function graduateIds(state: GameState): string[] {
  return Object.keys(state.civilizations).filter(id => state.civilizations[id]!.graduatedFrom !== undefined);
}

describe('graduation across save and reload (#497)', () => {
  it('a save taken just before the graduation round graduates the same city-state when continued', () => {
    const { state, minorCivId } = ripeAndSelectedGraduationState(true);
    const civId = getGraduateCivId(state.minorCivs[minorCivId]!.definitionId);

    const uninterrupted = advance(state, 4);
    const continued = advance(saveAndReload(state), 4);

    expect(graduateIds(uninterrupted)).toEqual([civId]);
    expect(graduateIds(continued)).toEqual([civId]);
    assertSimulationEquivalent(saveAndReload(continued), saveAndReload(uninterrupted), 'save before the graduation round');
  }, TIMEOUT_MS);

  it('a save taken just after the graduation round continues to the same state as an uninterrupted run', () => {
    const { state, minorCivId } = ripeAndSelectedGraduationState(true);
    const civId = getGraduateCivId(state.minorCivs[minorCivId]!.definitionId);

    const justAfter = advance(state, 1);
    expect(graduateIds(justAfter)).toEqual([civId]);

    const uninterrupted = advance(justAfter, 5);
    const continued = advance(saveAndReload(justAfter), 5);
    assertSimulationEquivalent(saveAndReload(continued), saveAndReload(uninterrupted), 'save after the graduation round');
    assertSaveStateInvariants(continued, 'after reload and five rounds');
  }, TIMEOUT_MS);

  it('the load path is a fixed point on a graduated game, and keeps the record and the civilization', () => {
    const { state, minorCivId } = ripeAndSelectedGraduationState(true);
    const civId = getGraduateCivId(state.minorCivs[minorCivId]!.definitionId);
    const reloaded = saveAndReload(advance(state, 2));

    assertSimulationEquivalent(saveAndReload(reloaded), reloaded, 'normalizeLoadedState idempotence after a graduation');
    expect(reloaded.civilizations[civId]!.graduatedFrom).toMatchObject({ minorCivId, definitionId: state.minorCivs[minorCivId]!.definitionId });
    expect(reloaded.minorCivs[minorCivId]).toMatchObject({ isDestroyed: true, graduation: { civId } });
    // The record is history: loading must not rebuild the economy of a city-state that is no longer one.
    expect(reloaded.minorCivs[minorCivId]!.economy).toBeUndefined();
    assertSaveStateInvariants(reloaded, 'graduated game after reload');
  }, TIMEOUT_MS);

  it('a save that predates graduation (none of its fields) loads and plays on unchanged, with nothing graduating', () => {
    const { state } = ripeAndSelectedGraduationState(false);
    delete state.settings.cityStateGraduation;
    for (const minorCiv of Object.values(state.minorCivs)) delete minorCiv.graduation;
    for (const civ of Object.values(state.civilizations)) delete civ.graduatedFrom;

    const reloaded = saveAndReload(state);
    expect(reloaded.settings.cityStateGraduation).toBeUndefined();
    const continued = advance(reloaded, 3);
    expect(graduateIds(continued)).toEqual([]);
    assertSimulationEquivalent(saveAndReload(continued), saveAndReload(advance(state, 3)), 'a pre-graduation save plays on unchanged');
  }, TIMEOUT_MS);
});
