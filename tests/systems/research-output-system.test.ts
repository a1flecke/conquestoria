import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { foundCity } from '@/systems/city-system';
import { FULL_CONTRIBUTION_RESEARCH_POLICY } from '@/systems/research-coordination-system';
import { calculateCivResearchOutput } from '@/systems/research-output-system';

const ISSUE_917_CITY_SCIENCE = [9, 8, 8, 8, 7, 5, 5, 4, 1, 1, 1, 1];

describe('calculateCivResearchOutput', () => {
  it('keeps the #917 literal 58 science distribution under MR1 identity coordination', () => {
    const state = createNewGame('rome', 'issue-917-golden-science', 'small');
    const authoritativeCityScience = Object.fromEntries(
      ISSUE_917_CITY_SCIENCE.map((science, index) => [`city-${index + 1}`, science]),
    );

    const breakdown = calculateCivResearchOutput(state, 'player', {
      authoritativeCityScience,
      policy: FULL_CONTRIBUTION_RESEARCH_POLICY,
    });

    expect(ISSUE_917_CITY_SCIENCE.reduce((sum, value) => sum + value, 0)).toBe(58);
    expect(breakdown).toMatchObject({
      grossCityScience: 58,
      coordinatedCityScience: 58,
      finalScience: 58,
    });
  });

  it('uses diminishing coordination by default for the #917 distribution', () => {
    const state = createNewGame('rome', 'issue-917-default-coordination', 'small');
    const authoritativeCityScience = Object.fromEntries(
      ISSUE_917_CITY_SCIENCE.map((science, index) => [`city-${index + 1}`, science]),
    );

    const breakdown = calculateCivResearchOutput(state, 'player', { authoritativeCityScience });

    expect(breakdown).toMatchObject({
      grossCityScience: 58,
      coordinatedCityScience: 24,
      finalScience: 24,
    });
  });

  it('does not invent optional bonus or penalty rows when their contributors are absent', () => {
    const state = createNewGame('rome', 'issue-917-no-optional-contributors', 'small');

    const breakdown = calculateCivResearchOutput(state, 'player', {
      authoritativeCityScience: { capital: 9, second: 4 },
      policy: FULL_CONTRIBUTION_RESEARCH_POLICY,
    });

    expect(breakdown.rows.map(row => row.kind)).toEqual([
      'city-gross',
      'coordination',
      'final',
    ]);
  });

  it('adds civilization bonuses after city coordination and applies misinformation last', () => {
    const state = createNewGame('rome', 'issue-917-empire-bonus-order', 'small');
    const player = state.civilizations.player;
    player.civType = 'narnia';
    player.techState.completed = ['structuralism'];
    player.diplomacy.treaties.push({ type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: -1 });
    player.researchPenaltyTurns = 1;
    player.researchPenaltyMultiplier = 0.25;
    state.completedLegendaryWonders = {
      'world-archive': { ownerId: 'player', cityId: 'capital', turnCompleted: state.turn },
    };

    const breakdown = calculateCivResearchOutput(state, 'player', {
      authoritativeCityScience: { capital: 9, second: 4 },
      policy: FULL_CONTRIBUTION_RESEARCH_POLICY,
    });

    expect(breakdown).toMatchObject({
      grossCityScience: 13,
      coordinatedCityScience: 13,
      empireBonusScience: 8,
      penaltyMultiplier: 0.25,
      finalScience: 15,
    });
    expect(breakdown.rows.map(row => row.kind)).toEqual([
      'city-gross',
      'coordination',
      'empire-bonus',
      'temporary-penalty',
      'final',
    ]);
  });

  it('matches the live turn for city-scoped modifiers and idle-science conversion', () => {
    const state = createNewGame('rome', 'issue-917-live-projection-parity', 'small');
    const player = state.civilizations.player;
    const city = foundCity('player', state.units[player.units[0]!]!.position, state.map, state.idCounters);
    city.buildings = ['library'];
    city.productionQueue = [];
    city.idleProduction = 'science';
    state.cities[city.id] = city;
    player.cities = [city.id];
    player.techState.completed = ['rationalism'];
    player.techState.currentResearch = 'cyber-warfare';
    state.completedLegendaryWonders = {
      'starvault-observatory': { ownerId: 'player', cityId: city.id, turnCompleted: state.turn },
    };

    const projected = calculateCivResearchOutput(state, 'player');
    const next = processTurn(state, new EventBus());

    expect(next.civilizations.player.techState.researchProgress).toBe(projected.finalScience);
  });
});
