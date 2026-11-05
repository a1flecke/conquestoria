import type { GameState } from '@/core/types';
import { getMinorCivPopulationCeiling } from '@/systems/minor-civ-economy-system';
import { planMinorCivGraduations } from '@/systems/minor-civ-graduation';
import { MINOR_CIV_GRADUATION_TUNING } from '@/systems/minor-civ-graduation-rules';
import { advancePlayerCivToEra, fixturePeacefulIsolated } from '../systems/helpers/minor-civ-scenario-fixtures';

/**
 * City-state graduation (#497) test fixture: a ripe, peaceful city-state on a cadence turn, and a search for a campaign
 * id whose seeded draw picks it. Shared by the round-phase test and the save/reload test so both exercise the same state.
 */

const TUNING = MINOR_CIV_GRADUATION_TUNING.standard;
const BUILDING_IDS = ['barracks', 'marketplace', 'library', 'granary', 'walls', 'temple', 'workshop', 'harbor'];
export const GRADUATION_TURN = 400;

export function ripeGraduationState(gameId: string): { state: GameState; minorCivId: string } {
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
export function ripeAndSelectedGraduationState(enabled: boolean): { state: GameState; minorCivId: string } {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const candidate = ripeGraduationState(`graduation-phase-${attempt}`);
    candidate.state.settings.cityStateGraduation = enabled ? 'on' : 'off';
    const plan = planMinorCivGraduations(candidate.state);
    if (plan.status === 'evaluated' && plan.selectedMinorCivId === candidate.minorCivId) return candidate;
  }
  throw new Error('no campaign id produced a successful graduation draw');
}
