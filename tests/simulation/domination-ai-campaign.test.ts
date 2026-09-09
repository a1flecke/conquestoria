import { describe, expect, it } from 'vitest';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import type { AIDecisionTrace } from '@/ai/ai-decision-trace';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { EventBus } from '@/core/event-bus';
import { createHotSeatGame } from '@/core/game-state';
import type { GameState, HexCoord, HotSeatConfig } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { recordDominationPoliticalReport } from '@/systems/domination-intel';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { updateAndRefreshVisibility } from '@/systems/last-seen-presentation';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { processTurn } from '@/core/turn-manager';
import { createUnit } from '@/systems/unit-system';
import { normalizeLoadedState } from '@/storage/save-manager';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { assertBilateralWar } from '../helpers/save-state-invariants';

const SEED = 'domination-ai-campaign-standard-v1';
const SAVE_ROUND = 3;
const MAX_ROUNDS = 200;
const CAMPAIGN_TIMEOUT_MS = 90_000;

const CAMPAIGN_CONFIG: HotSeatConfig = {
  playerCount: 3,
  mapSize: 'small',
  mapScript: 'balanced',
  players: [
    { slotId: 'player-1', name: 'North', civType: 'rome', isHuman: true },
    { slotId: 'player-2', name: 'South', civType: 'greece', isHuman: true },
    { slotId: 'ai-1', name: 'Mongolia', civType: 'mongolia', isHuman: false },
  ],
};

function lane(state: GameState): [HexCoord, HexCoord, HexCoord] {
  const tiles = Object.values(state.map.tiles)
    .map(tile => tile.coord)
    .sort((left, right) => left.r - right.r || left.q - right.q);
  for (const left of tiles) {
    const center = { q: left.q + 2, r: left.r };
    const right = { q: left.q + 4, r: left.r };
    if (state.map.tiles[hexKey(center)] && state.map.tiles[hexKey(right)]) {
      return [left, center, right];
    }
  }
  throw new Error(`${SEED}: no five-hex plains lane on generated map`);
}

function establishOccupiedCity(state: GameState, civId: string, position: HexCoord): void {
  const civ = state.civilizations[civId];
  for (const unitId of civ.units) delete state.units[unitId];
  civ.units = [];
  const city = foundCity(civId, position, state.map, state.idCounters, { civType: civ.civType });
  state.cities[city.id] = city;
  civ.cities = [city.id];
  state.map.tiles[hexKey(position)]!.owner = civId;
}

function addCampaignTank(state: GameState, position: HexCoord): void {
  const tank = createUnit('tank', 'ai-1', position, state.idCounters);
  state.units[tank.id] = tank;
  state.civilizations['ai-1'].units.push(tank.id);
}

/**
 * Starts three living, independent major empires with lawful late-era units
 * and a prepared operational front. No role, winner, elimination, capture,
 * treaty, or AI executor is faked after this setup.
 */
function campaignStart(): GameState {
  const state = createHotSeatGame(CAMPAIGN_CONFIG, SEED, 'Domination AI campaign', 'standard');
  const [left, center, right] = lane(state);
  for (const tile of Object.values(state.map.tiles)) {
    if (hexDistance(tile.coord, center) <= 6) {
      tile.terrain = 'plains';
      tile.elevation = 'lowland';
      tile.resource = null;
      tile.improvement = 'none';
      tile.improvementTurnsLeft = 0;
      tile.owner = null;
    }
  }
  establishOccupiedCity(state, 'player-1', left);
  establishOccupiedCity(state, 'ai-1', center);
  establishOccupiedCity(state, 'player-2', right);
  state.turn = 6;
  state.era = 9;
  for (const civ of Object.values(state.civilizations)) {
    civ.techState.completed = TECH_TREE.map(tech => tech.id);
    civ.techState.currentResearch = null;
    civ.techState.researchQueue = [];
    civ.techState.researchProgress = 0;
    civ.gold = 1_000;
  }
  addCampaignTank(state, { q: center.q - 1, r: center.r });
  addCampaignTank(state, { q: center.q - 1, r: center.r });
  addCampaignTank(state, { q: center.q + 1, r: center.r });
  addCampaignTank(state, { q: center.q + 1, r: center.r });

  const ai = state.civilizations['ai-1'];
  ai.knownCivilizations = ['player-1', 'player-2'];
  state.civilizations['player-1'].knownCivilizations = ['ai-1'];
  state.civilizations['player-2'].knownCivilizations = ['ai-1'];
  updateAndRefreshVisibility(state, 'ai-1');
  let reported = recordDominationPoliticalReport(state, 'ai-1', 'player-1');
  reported = recordDominationPoliticalReport(reported, 'ai-1', 'player-2');
  // The real load path canonicalizes legacy-balanced-map region metadata.
  // Start both trajectories from that canonical current-schema form so this
  // campaign's equality check isolates the fixed mid-campaign save boundary.
  return normalizeLoadedState(reported);
}

function saveAndReload(state: GameState): GameState {
  const parsed = parseSaveFile(serializeSaveFile(state));
  if (parsed.status !== 'success') throw new Error(`${SEED}: save round trip failed: ${parsed.message}`);
  return normalizeLoadedState(parsed.state);
}

interface CampaignResult {
  state: GameState;
  traces: AIDecisionTrace[];
  rivalStatusChanges: string[];
}

function runCampaign(start: GameState, reloadAtSaveRound: boolean): CampaignResult {
  let state = start;
  const traces: AIDecisionTrace[] = [];
  const rivalStatusChanges: string[] = [];
  for (let round = 1; round <= MAX_ROUNDS && !state.gameOver; round += 1) {
    const beforeOwners = Object.fromEntries(
      ['player-1', 'player-2'].map(civId => [civId, [...state.civilizations[civId].cities]]),
    );
    let roundTraces: AIDecisionTrace[] = [];
    const completed = runCompletedRound(state, new EventBus(), {
      improvements: processImprovementTurns,
      majors: (current, bus) => {
        const result = processNonHumanMajorRound(current, bus);
        if (result.planningErrors.length > 0) {
          throw new Error(`${SEED}: planning failed: ${JSON.stringify(result.planningErrors)}`);
        }
        roundTraces = result.traces;
        return result.state;
      },
      world: processTurn,
      postprocess: applyStrategicWarningTransitions,
    });
    if (!completed.ok) throw completed.error;
    state = completed.state;
    traces.push(...roundTraces);
    assertBilateralWar(state);
    for (const civId of ['player-1', 'player-2']) {
      if (beforeOwners[civId].length > 0 && state.civilizations[civId].cities.length === 0) {
        rivalStatusChanges.push(`${civId}:eliminated@${state.turn}`);
      }
    }
    if (round === SAVE_ROUND && reloadAtSaveRound) state = saveAndReload(state);
  }
  return { state, traces, rivalStatusChanges };
}

describe('Domination AI campaign', () => {
  it('wins a real three-empire campaign and preserves it through a fixed save/reload boundary', () => {
    const uninterrupted = runCampaign(campaignStart(), false);
    const reloaded = runCampaign(campaignStart(), true);

    expect(uninterrupted.state.gameOverReason).toBe('domination');
    expect(uninterrupted.state.winner).toBe('ai-1');
    expect(uninterrupted.rivalStatusChanges).toHaveLength(2);
    expect(uninterrupted.traces.some(trace =>
      trace.candidates.some(candidate => candidate.reasonCodes?.includes('domination-pursuit')),
    )).toBe(true);
    expect(uninterrupted.state.turn).toBeLessThanOrEqual(MAX_ROUNDS + 1);
    expect(reloaded.state.turn).toBe(uninterrupted.state.turn);
    expect(reloaded.traces).toEqual(uninterrupted.traces);
    expect(reloaded.rivalStatusChanges).toEqual(uninterrupted.rivalStatusChanges);
    assertSimulationEquivalent(
      saveAndReload(reloaded.state),
      saveAndReload(uninterrupted.state),
      'Domination campaign save/reload',
    );
  }, CAMPAIGN_TIMEOUT_MS);
});
