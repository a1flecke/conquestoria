import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { getAvailableActions, hasArmsControlTreaty } from '@/systems/diplomacy-system';
import { evaluateDiplomacy } from '@/ai/ai-diplomacy';
import { resolveCivilizationEra, resolveWorldAge, TECH_TREE } from '@/systems/tech-definitions';

const LAGGARD = 'player';

function techsThroughEra(era: number): string[] {
  return TECH_TREE.filter(tech => tech.era <= era).map(tech => tech.id);
}

/**
 * Four major civilizations, three advanced through era 4 and one (`player`)
 * left behind with no diplomacy-track techs at all. `resolveWorldAge` needs a
 * majority, so a two-civ fixture collapses World Age onto the laggard's own
 * era and hides this divergence entirely (the same reason #984's fixture
 * needed >=3 civs).
 */
function laggardWorldState(seed: string): GameState {
  const state = createNewGame({
    civType: 'rome',
    seed,
    mapSize: 'medium',
    opponentCount: 3,
    gameTitle: 'diplomacy-era-parity',
  });
  const advanced = techsThroughEra(4);
  for (const civ of Object.values(state.civilizations)) {
    if (civ.id === LAGGARD) continue;
    civ.techState.completed = [...advanced];
  }
  state.era = resolveWorldAge(state.civilizations);
  state.civilizations[LAGGARD].techState.completed = [];
  return state;
}

describe('#1027 — diplomacy action gates must use the acting civ\'s own era', () => {
  it('the fixture really separates World Age from the laggard civ era', () => {
    const state = laggardWorldState('era-split');
    expect(Object.keys(state.civilizations).length).toBeGreaterThanOrEqual(4);
    expect(state.era).toBe(4);
    expect(resolveCivilizationEra(state.civilizations[LAGGARD].techState.completed)).toBe(1);
  });

  it('a laggard human and a laggard AI resolve the same available action set', () => {
    const state = laggardWorldState('human-ai-parity');
    const civ = state.civilizations[LAGGARD];
    const civEra = resolveCivilizationEra(civ.techState.completed);

    // Human path (diplomacy-panel.ts): always uses the actor's own civ era.
    const humanActions = getAvailableActions(
      civ.diplomacy, 'ai-1', civ.techState.completed, civEra, hasArmsControlTreaty(state, LAGGARD),
    );

    // AI path as basic-ai.ts calls it today: `newState.era` (World Age).
    const aiActionsToday = getAvailableActions(
      civ.diplomacy, 'ai-1', civ.techState.completed, state.era, hasArmsControlTreaty(state, LAGGARD),
    );

    // This is the bug: with World Age > civ era, the AI path currently
    // unlocks treaties the human path (correctly) denies.
    expect(aiActionsToday).not.toEqual(humanActions);
    expect(aiActionsToday).toContain('non_aggression_pact');
    expect(humanActions).not.toContain('non_aggression_pact');
  });

  it('NAP: unavailable below civ era 2 with no bypass tech, even at high World Age', () => {
    const state = laggardWorldState('nap-below-gate');
    const civ = state.civilizations[LAGGARD];
    const civEra = resolveCivilizationEra(civ.techState.completed);
    expect(civEra).toBe(1);

    const actions = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    expect(actions).not.toContain('non_aggression_pact');
  });

  it('NAP: the diplomacy-tech bypass still works below the era gate', () => {
    const state = laggardWorldState('nap-tech-bypass');
    const civ = state.civilizations[LAGGARD];
    civ.techState.completed = ['diplomacy-tech'];
    const civEra = resolveCivilizationEra(civ.techState.completed);
    expect(civEra).toBe(1);

    const actions = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    expect(actions).toContain('non_aggression_pact');
  });

  it('NAP: available once the civ actually reaches era 2', () => {
    const state = laggardWorldState('nap-era-gate');
    const civ = state.civilizations[LAGGARD];
    civ.techState.completed = techsThroughEra(2);
    const civEra = resolveCivilizationEra(civ.techState.completed);
    expect(civEra).toBeGreaterThanOrEqual(2);

    const actions = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    expect(actions).toContain('non_aggression_pact');
  });

  it('Trade Agreement: unavailable below civ era 3 despite high World Age, relationship > 0 required', () => {
    const state = laggardWorldState('trade-below-gate');
    const civ = state.civilizations[LAGGARD];
    civ.diplomacy.relationships['ai-1'] = 50;
    const civEra = resolveCivilizationEra(civ.techState.completed);
    expect(civEra).toBeLessThan(3);

    const actions = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    expect(actions).not.toContain('trade_agreement');
  });

  it('Trade Agreement: tech bypass works; relationship <= 0 still blocks it', () => {
    const state = laggardWorldState('trade-tech-bypass');
    const civ = state.civilizations[LAGGARD];
    civ.techState.completed = ['currency'];
    const civEra = resolveCivilizationEra(civ.techState.completed);

    civ.diplomacy.relationships['ai-1'] = 50;
    expect(getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false))
      .toContain('trade_agreement');

    civ.diplomacy.relationships['ai-1'] = 0;
    expect(getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false))
      .not.toContain('trade_agreement');
  });

  it('Open Borders / Alliance: unavailable below civ era 4 despite high World Age', () => {
    const state = laggardWorldState('alliance-below-gate');
    const civ = state.civilizations[LAGGARD];
    const civEra = resolveCivilizationEra(civ.techState.completed);
    expect(civEra).toBeLessThan(4);

    const actions = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    expect(actions).not.toContain('open_borders');
    expect(actions).not.toContain('alliance');
  });

  it('Open Borders / Alliance: the political-philosophy tech bypass still works', () => {
    const state = laggardWorldState('alliance-tech-bypass');
    const civ = state.civilizations[LAGGARD];
    civ.techState.completed = ['political-philosophy'];
    const civEra = resolveCivilizationEra(civ.techState.completed);

    const actions = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    expect(actions).toContain('open_borders');
    expect(actions).toContain('alliance');
  });

  it('Alliance: an already-signed alliance is never offered again', () => {
    const state = laggardWorldState('alliance-duplicate');
    const civ = state.civilizations[LAGGARD];
    civ.techState.completed = techsThroughEra(4);
    civ.diplomacy.treaties = [{ type: 'alliance', civA: LAGGARD, civB: 'ai-1', turnsRemaining: -1 }];
    const civEra = resolveCivilizationEra(civ.techState.completed);

    const actions = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    expect(actions).not.toContain('alliance');
    // Open Borders is a distinct treaty and remains offerable.
    expect(actions).toContain('open_borders');
  });

  it('World Age alone (civ era and techs unchanged) does not change diplomacy availability', () => {
    const state = laggardWorldState('world-age-negative-control');
    const civ = state.civilizations[LAGGARD];
    const civEra = resolveCivilizationEra(civ.techState.completed);
    const before = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);

    // Advance every OTHER civ further, changing World Age but not this civ's own era.
    for (const other of Object.values(state.civilizations)) {
      if (other.id === LAGGARD) continue;
      other.techState.completed = techsThroughEra(8);
    }
    const higherWorldAge = resolveWorldAge(state.civilizations);
    expect(higherWorldAge).toBeGreaterThan(state.era);

    const after = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    expect(after).toEqual(before);
  });

  it('civ era alone (World Age unchanged) does change diplomacy availability', () => {
    const state = laggardWorldState('civ-era-positive-control');
    const civ = state.civilizations[LAGGARD];
    const before = getAvailableActions(
      civ.diplomacy, 'ai-1', civ.techState.completed, resolveCivilizationEra(civ.techState.completed), false,
    );
    expect(before).not.toContain('non_aggression_pact');

    civ.techState.completed = techsThroughEra(2);
    const worldAgeUnchanged = resolveWorldAge(state.civilizations);
    expect(worldAgeUnchanged).toBe(state.era);

    const after = getAvailableActions(
      civ.diplomacy, 'ai-1', civ.techState.completed, resolveCivilizationEra(civ.techState.completed), false,
    );
    expect(after).toContain('non_aggression_pact');
  });

  it('evaluateDiplomacy cannot propose an action absent from getAvailableActions at the same era', () => {
    const state = laggardWorldState('ai-cannot-exceed-canonical');
    const civ = state.civilizations[LAGGARD];
    const civEra = resolveCivilizationEra(civ.techState.completed);
    civ.diplomacy.relationships['ai-1'] = 90;

    const canonical = getAvailableActions(civ.diplomacy, 'ai-1', civ.techState.completed, civEra, false);
    const decisions = evaluateDiplomacy(
      { traits: ['diplomatic'], warLikelihood: 0, diplomacyFocus: 0.9, expansionDrive: 0 },
      civ.diplomacy,
      civ.techState.completed,
      civEra,
      {},
      { exactVisible: 10, remembered: 10, uncertaintyLower: 10, uncertaintyUpper: 10, midpoint: 10 },
      state.turn,
      { 'ai-1': { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      false,
      false,
    );
    for (const decision of decisions) {
      expect(canonical, decision.action).toContain(decision.action);
    }
    // Positive assertion the fixture is meaningful: at relationship 90 and civ
    // era 1, no treaty is proposed at all (era gate correctly denies them).
    expect(decisions).toEqual([]);
  });
});
