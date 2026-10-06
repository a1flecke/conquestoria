import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import { getBlockadedCityIds } from '@/systems/blockade-system';
import { buildCouncilAgenda } from '@/systems/council-system';
import { buildAssessmentDigest, buildStrategicAssessment, diffAssessment } from '@/systems/strategic-assessment';
import { readAssessmentDigest } from '@/systems/assessment-history';
import { AI_A, HUMAN_A, HUMAN_B } from '../helpers/viewer-knowledge-fixtures';
import { addShip, blockadeByMajorCiv, ring } from '../helpers/blockade-fixture';
import { twoCityWorld } from '../helpers/assessment-fixtures';

// #1355: a blockade of the viewer's own city is a strategic constraint, projected from the one authoritative fact.
const FIRST = 'city-a-first';
const SECOND = 'city-b-second';

const blockadeOf = (state: GameState, viewer = HUMAN_A) =>
  buildStrategicAssessment(state, viewer).constraints.find(c => c.kind === 'blockade');

describe('blockade as a strategic constraint (#1355)', () => {
  it('is absent before and present after a hostile major civ blockades an owned city', () => {
    const state = twoCityWorld(false);
    expect(blockadeOf(state)).toBeUndefined();
    blockadeByMajorCiv(state, SECOND);
    expect(getBlockadedCityIds(state)).toEqual([SECOND]);
    const constraint = blockadeOf(state)!;
    expect(constraint).toBeDefined();
    expect(constraint.title).toBe(`${state.cities[SECOND].name} is blockaded`);
    expect(constraint.focusCityId).toBe(SECOND);
    expect(constraint.destination).toEqual({ kind: 'open-city', cityId: SECOND });
    expect(constraint.severity).toBeGreaterThanOrEqual(60);
  });

  it('states the real economic consequence and no other', () => {
    const state = twoCityWorld(false);
    blockadeByMajorCiv(state, SECOND);
    const why = blockadeOf(state)!.why;
    expect(why).toContain('25% of its gold');
    expect(why).toContain('sea trade is suspended');
    expect(why).not.toMatch(/production|food|unit/i);
    expect(why.split('.')[0].split(/\s+/).length).toBeLessThanOrEqual(18);
  });

  it('never reveals who or what is blockading', () => {
    const state = twoCityWorld(false);
    blockadeByMajorCiv(state, SECOND);
    const text = JSON.stringify(blockadeOf(state));
    expect(text).not.toContain(AI_A);
    expect(text).not.toContain(state.civilizations[AI_A].name);
    expect(text).not.toMatch(/frigate|ship|fleet|warship/i);
    expect(text).not.toContain('ship-1');
  });

  it('reports a pirate blockade the same way', () => {
    const state = twoCityWorld(false);
    state.pirates = createEmptyPirateState();
    const city = state.cities[SECOND];
    const { adjacent, outer } = ring(state, city.position);
    for (const [id, at] of [['p1', adjacent[0]], ['p2', outer[0]]] as const) {
      addShip(state, 'pirate-1', 'pirate_corsair', at, id);
    }
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'pirate-1', spawnedRound: 1, behavior: 'blockading', maritimeStage: 3, notoriety: 5,
      shipIds: ['p1', 'p2'],
      headquarters: { kind: 'coastal-enclave', position: { q: 0, r: 0 }, integrity: 100, maxIntegrity: 100 },
      tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null, transitionGuards: { emittedEventKeys: [] },
    } as PirateFactionState;
    expect(getBlockadedCityIds(state)).toEqual([SECOND]);
    expect(blockadeOf(state)?.focusCityId).toBe(SECOND);
  });

  it('does not report a blockade of a foreign city as the viewer\'s own', () => {
    const state = twoCityWorld(false);
    blockadeByMajorCiv(state, SECOND);
    expect(blockadeOf(state, HUMAN_B)).toBeUndefined();
    expect(blockadeOf(state, AI_A)).toBeUndefined();
  });

  it('is the owner\'s fact whoever the active seat is', () => {
    const state = twoCityWorld(false);
    blockadeByMajorCiv(state, SECOND);
    state.currentPlayer = HUMAN_A;
    const asOwner = blockadeOf(state);
    state.currentPlayer = HUMAN_B;
    expect(blockadeOf(state)).toEqual(asOwner);
  });

  it('names the worst city deterministically when several are blockaded, never five cards', () => {
    const state = twoCityWorld(false);
    blockadeByMajorCiv(state, SECOND, 'a');
    blockadeByMajorCiv(state, FIRST, 'b');
    expect(getBlockadedCityIds(state).sort()).toEqual([FIRST, SECOND]);
    state.marketplace = { ...(state.marketplace ?? {} as never), tradeRoutes: [
      { id: 'r1', fromCityId: SECOND, toCityId: 'elsewhere', goldPerTrip: 5, turnsPerTrip: 2 },
    ] } as GameState['marketplace'];
    const forward = buildStrategicAssessment(state, HUMAN_A).constraints.filter(c => c.kind === 'blockade');
    expect(forward).toHaveLength(1);
    expect(forward[0].focusCityId).toBe(SECOND);
    state.civilizations[HUMAN_A].cities.reverse();
    expect(blockadeOf(state)?.focusCityId).toBe(SECOND);
    state.marketplace = { ...state.marketplace!, tradeRoutes: [] };
    // With equal impact the tie breaks by city id.
    const tied = blockadeOf(state)!;
    expect([FIRST, SECOND]).toContain(tied.focusCityId);
    state.civilizations[HUMAN_A].cities.reverse();
    expect(blockadeOf(state)?.focusCityId).toBe(tied.focusCityId);
  });

  it('does not change the other constraints', () => {
    const state = twoCityWorld(true);
    const without = buildStrategicAssessment(state, HUMAN_A).constraints.filter(c => c.kind !== 'blockade');
    blockadeByMajorCiv(state, SECOND);
    const withBlockade = buildStrategicAssessment(state, HUMAN_A).constraints;
    expect(withBlockade.some(c => c.kind === 'blockade')).toBe(true);
    expect(withBlockade.filter(c => c.kind === 'food').length).toBe(without.filter(c => c.kind === 'food').length);
  });

  it('reaches the Council as a warchief card that opens the city', () => {
    const state = twoCityWorld(false);
    blockadeByMajorCiv(state, SECOND);
    const agenda = buildCouncilAgenda(state, HUMAN_A);
    const card = [...agenda.doNow, ...agenda.soon].find(c => c.id === 'constraint-blockade')!;
    expect(card).toBeDefined();
    expect(card.advisor).toBe('warchief');
    expect(card.action).toEqual({ kind: 'open-city', cityId: SECOND });
    expect(card.why).not.toMatch(/frigate|fleet/i);
    expect(JSON.stringify(buildCouncilAgenda(state, HUMAN_B))).not.toContain('constraint-blockade');
  });
});

describe('blockade in the since-your-last-turn history (#1355)', () => {
  it('reports a new blockade, then reports it resolved without claiming a fleet was destroyed', () => {
    const calm = twoCityWorld(false);
    const before = buildAssessmentDigest(buildStrategicAssessment(calm, HUMAN_A));
    const blockaded = twoCityWorld(false);
    blockadeByMajorCiv(blockaded, SECOND);
    const news = diffAssessment(before, buildStrategicAssessment(blockaded, HUMAN_A));
    expect(news).toEqual([expect.objectContaining({ kind: 'new', title: `${blockaded.cities[SECOND].name} is blockaded` })]);

    const during = buildAssessmentDigest(buildStrategicAssessment(blockaded, HUMAN_A));
    const resolved = diffAssessment(during, buildStrategicAssessment(twoCityWorld(false), HUMAN_A));
    expect(resolved).toEqual([expect.objectContaining({ kind: 'resolved', title: 'The blockade is no longer a concern' })]);
    expect(JSON.stringify(resolved)).not.toMatch(/destroy|defeat|retreat|sunk/i);
  });

  it('persists and reads back a digest that contains a blockade', () => {
    const state = twoCityWorld(false);
    blockadeByMajorCiv(state, SECOND);
    const digest = buildAssessmentDigest(buildStrategicAssessment(state, HUMAN_A));
    expect(digest.constraints.map(c => c.kind)).toContain('blockade');
    const stored = { ...state, turn: digest.turn + 1, assessmentDigestByCiv: { [HUMAN_A]: JSON.parse(JSON.stringify(digest)) } };
    expect(readAssessmentDigest(stored as GameState, HUMAN_A)?.constraints.map(c => c.kind)).toContain('blockade');
  });

  it('still reads an old digest that has never heard of blockades', () => {
    const state = twoCityWorld(false);
    const old = { turn: 0, constraints: [{ kind: 'gold', bucket: 'mid' }], victory: [] };
    expect(readAssessmentDigest({ ...state, turn: 3, assessmentDigestByCiv: { [HUMAN_A]: old } } as GameState, HUMAN_A)).toBeDefined();
  });
});
