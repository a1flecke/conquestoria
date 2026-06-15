import { describe, it, expect } from 'vitest';
import { computeThreatScore } from '@/systems/threat-pressure-system';
import type { GameState, HexTile, Civilization } from '@/core/types';

function makeScenario(era: number, idleTurns: number, dominanceRatio: number): GameState {
  const tiles: Record<string, HexTile> = {};
  const totalTiles = 20;
  const ownedCount = Math.round(totalTiles * dominanceRatio);
  for (let q = 0; q < totalTiles; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: q < ownedCount ? 'p1' : null,
      improvementTurnsLeft: 0, hasRiver: false, wonder: null, regionKey: 'continent-0',
    };
  }
  const lastCombatTurn = 100 - idleTurns;
  const p1: Civilization = {
    id: 'p1', name: 'P1', color: '#fff', isHuman: true, civType: 'egypt',
    cities: ['c1'], units: [], gold: 0, visibility: { tiles: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [] },
    lastCombatTurnByLandmass: { 'continent-0': lastCombatTurn },
  };
  return {
    turn: 100, era,
    civilizations: { p1 },
    map: { width: 25, height: 5, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: { c1: { id: 'c1', owner: 'p1', position: { q: 0, r: 0 } } as any },
    barbarianCamps: {}, minorCivs: {}, currentPlayer: 'p1',
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    gameOver: false, winner: null,
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as unknown as GameState;
}

describe('threat score balance bands', () => {
  it('era-2, 6 idle turns, 50% dominance: score ≥ 2.5 (land resurgence eligible)', () => {
    const state = makeScenario(2, 6, 0.5);
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBeGreaterThanOrEqual(2.5);
  });

  it('era-2, 10 idle turns, 70% dominance: score ≥ 4.0 (pirate eligible)', () => {
    const state = makeScenario(2, 10, 0.7);
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBeGreaterThanOrEqual(4.0);
  });

  it('era-3, dominant + 15 idle turns: score > 8 (bandit lord eligible)', () => {
    const state = makeScenario(3, 15, 0.9);
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBeGreaterThan(8);
  });

  it('idleFactor caps at 1.5 — score does not increase past 20+ idle turns', () => {
    const s15 = makeScenario(3, 15, 0.9);
    const s25 = makeScenario(3, 25, 0.9);
    expect(computeThreatScore(s15, 'p1', 'continent-0')).toBeCloseTo(
      computeThreatScore(s25, 'p1', 'continent-0'), 5
    );
  });
});
