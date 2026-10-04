import { describe, expect, it } from 'vitest';
import type { ActiveEventChain, CouncilAgenda, CouncilCard, GameState } from '@/core/types';
import { buildCouncilAgenda } from '@/systems/council-system';
import { hexKey } from '@/systems/hex-utils';
import { EVENT_CHAIN_CARD_ID_PREFIX } from '@/systems/event-chain-presentation';
import { buildStrategicAssessment } from '@/systems/strategic-assessment';
import { AI_A, AI_B, HUMAN_A, HUMAN_B, setNationalIntent } from '../helpers/viewer-knowledge-fixtures';
import { addCity, pickSites, twoCityWorld } from '../helpers/assessment-fixtures';
import { expectHotSeatDifferential, expectViewerSafety, type ViewerSurface } from '../helpers/viewer-safety';

/** Every card across the four buckets. */
function allCards(agenda: CouncilAgenda): CouncilCard[] {
  return [...agenda.doNow, ...agenda.soon, ...agenda.toWin, ...agenda.drama];
}

function pendingChain(targetCivId: string): ActiveEventChain {
  return {
    id: 'chain-1',
    kind: 'financial-panic',
    targetCivId,
    cityIds: ['c1'],
    stageId: 'onset',
    startedTurn: 1,
    turnsInStage: 0,
    nextEvaluationTurn: 1,
    priorChoices: [],
    pendingChoice: { stageId: 'onset', optionIds: ['bailout', 'austerity-reform', 'do-nothing'] },
  };
}

describe('Council agenda from the strategic assessment (#1237)', () => {
  it('the food card opens the starving SECOND city, not the first roster city', () => {
    const state = twoCityWorld(true);
    expect(state.civilizations[HUMAN_A].cities[0]).toBe('city-a-first');

    const card = buildCouncilAgenda(state, HUMAN_A).doNow.find(c => c.id === 'constraint-food');

    expect(card?.action).toEqual({ kind: 'open-city', cityId: 'city-b-second' });
    expect(card?.actionLabel).toBe('Open city');
    expect(card?.summary).toContain('B-SECOND');
    expect(card?.summary).not.toContain('A-FIRST');
  });

  it('a healthy empire gets no constraint cards and no static filler', () => {
    const state = twoCityWorld(false);
    const agenda = buildCouncilAgenda(state, HUMAN_A);
    const ids = allCards(agenda).map(card => card.id);

    expect(ids.filter(id => id.startsWith('constraint-'))).toEqual([]);
    expect(agenda.soon).toEqual([]);
    expect(ids).not.toContain('shape-the-economy');
    expect(ids).not.toContain('pick-a-victory-lane');
    expect(ids).not.toContain('food-warning');
  });

  it('the top constraints feed doNow in severity order, at most three', () => {
    const state = twoCityWorld(true);
    state.cities['city-a-first'].unrestLevel = 2;
    state.cities['city-a-first'].unrestTurns = 4;
    state.economyStatusByCiv = {
      ...state.economyStatusByCiv,
      [HUMAN_A]: {
        turn: state.turn, grossGoldIncome: 1, buildingMaintenance: 4, unitMaintenance: 4,
        netGoldPerTurn: -7, unpaidMaintenance: 7, strainLevel: 'critical',
      },
    };
    state.cities['city-b-second'].productionQueue = ['warrior', 'warrior', 'warrior', 'warrior'];

    const assessment = buildStrategicAssessment(state, HUMAN_A);
    const constraintCards = buildCouncilAgenda(state, HUMAN_A).doNow.filter(c => c.id.startsWith('constraint-'));

    expect(constraintCards.length).toBeLessThanOrEqual(3);
    expect(constraintCards.map(c => c.priority)).toEqual([...constraintCards.map(c => c.priority)].sort((a, b) => b - a));
    expect(constraintCards.map(c => c.id)).toEqual(
      assessment.constraints.filter(c => c.severity >= 40).slice(0, 3).map(c => `constraint-${c.kind}`),
    );
  });

  it('soon comes from the assessment: a below-urgent constraint appears there and not in doNow', () => {
    const state = twoCityWorld(false);
    // One queued item on a city whose production is paused for a turn: severity 36, below the do-now floor.
    state.cities['city-a-first'].productionQueue = ['warrior'];
    state.cities['city-a-first'].productionDisabledTurns = 1;
    const assessment = buildStrategicAssessment(state, HUMAN_A);
    const production = assessment.constraints.find(c => c.kind === 'production');
    expect(production, 'fixture must pause production').toBeDefined();
    expect(production!.severity).toBeLessThan(40);

    const agenda = buildCouncilAgenda(state, HUMAN_A);

    expect(agenda.soon.map(c => c.id)).toContain('constraint-production');
    expect(agenda.doNow.map(c => c.id)).not.toContain('constraint-production');
  });

  it('no research chosen: the science card opens the tech panel', () => {
    const state = twoCityWorld(false);
    state.civilizations[HUMAN_A].techState.currentResearch = null;

    const card = buildCouncilAgenda(state, HUMAN_A).doNow.find(c => c.id === 'constraint-science');

    expect(card?.action).toEqual({ kind: 'open-tech' });
    expect(card?.actionLabel).toBe('Choose research');
  });

  it('a civ that is researching has no science card', () => {
    const state = twoCityWorld(false);
    state.civilizations[HUMAN_A].techState.currentResearch = 'pottery';

    expect(allCards(buildCouncilAgenda(state, HUMAN_A)).map(c => c.id)).not.toContain('constraint-science');
  });

  it('constraints with no real destination are informational: no label, no action', () => {
    const state = twoCityWorld(false);
    state.economyStatusByCiv = {
      ...state.economyStatusByCiv,
      [HUMAN_A]: {
        turn: state.turn, grossGoldIncome: 1, buildingMaintenance: 4, unitMaintenance: 4,
        netGoldPerTurn: -7, unpaidMaintenance: 7, strainLevel: 'critical',
      },
    };

    const gold = buildCouncilAgenda(state, HUMAN_A).doNow.find(c => c.id === 'constraint-gold');

    expect(gold).toBeDefined();
    expect(gold!.action).toBeUndefined();
    expect(gold!.actionLabel).toBeUndefined();
  });

  it('every card that has an actionLabel has a typed action (or is an event-chain decision)', () => {
    const state = twoCityWorld(true);
    state.cities['city-a-first'].unrestLevel = 1;
    state.cities['city-a-first'].unrestTurns = 2;
    state.activeEventChains = { 'chain-1': pendingChain(HUMAN_A) };

    for (const card of allCards(buildCouncilAgenda(state, HUMAN_A))) {
      if (!card.actionLabel) continue;
      expect(
        Boolean(card.action) || card.id.startsWith(EVENT_CHAIN_CARD_ID_PREFIX),
        `card ${card.id} has a label "${card.actionLabel}" but nothing to dispatch`,
      ).toBe(true);
    }
  });

  it('keeps the calm filler only when there is genuinely no drama', () => {
    const calm = buildCouncilAgenda(twoCityWorld(false), HUMAN_A);
    expect(calm.drama.map(c => c.id)).toEqual(['council-murmur']);

    const state = twoCityWorld(false);
    state.activeEventChains = { 'chain-1': pendingChain(HUMAN_A) };
    const dramatic = buildCouncilAgenda(state, HUMAN_A);

    expect(dramatic.drama.length).toBeGreaterThan(0);
    expect(dramatic.drama.map(c => c.id)).not.toContain('council-murmur');
  });

  it('offers the Scout card only with a ready scout and unexplored frontier, and never over a real constraint', () => {
    const state = twoCityWorld(false);
    // twoCityWorld removes the viewer's units: no scout is ready, so no card.
    expect(buildCouncilAgenda(state, HUMAN_A).doNow.map(c => c.id)).not.toContain('survey-frontier');

    const starving = twoCityWorld(true);
    expect(buildCouncilAgenda(starving, HUMAN_A).doNow.map(c => c.id)).not.toContain('survey-frontier');
  });

  it('never dispatches the same card id twice across buckets', () => {
    const state = twoCityWorld(true);
    state.cities['city-a-first'].unrestLevel = 1;
    state.cities['city-a-first'].unrestTurns = 1;
    const ids = allCards(buildCouncilAgenda(state, HUMAN_A)).map(c => c.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Council agenda viewer safety and hot seat (#1237)', () => {
  const surface: ViewerSurface<GameState, CouncilAgenda> = {
    name: 'council agenda',
    project: (world, viewerId) => buildCouncilAgenda(world, viewerId),
  };

  it('nothing an unmet rival does reaches the agenda; the viewer\'s own starving city does', () => {
    const world = twoCityWorld(false);
    expectViewerSafety(surface, {
      world,
      viewerId: HUMAN_A,
      hidden: [
        { label: 'unmet rival changes its national intent', apply: s => setNationalIntent(s, AI_B, 'dominate') },
        {
          label: 'unmet rival founds a city',
          apply: s => addCity(s, AI_B, pickSites(s, 3)[2], 'city-hidden', 'grassland'),
        },
        {
          label: 'unmet rivals go to war',
          apply: s => {
            s.civilizations[AI_A].diplomacy.atWarWith.push(AI_B);
            s.civilizations[AI_B].diplomacy.atWarWith.push(AI_A);
          },
        },
      ],
      earned: [
        {
          label: 'the viewer\'s own second city starts starving',
          apply: s => {
            s.cities['city-b-second'].population = 6;
            for (const coord of s.cities['city-b-second'].ownedTiles) s.map.tiles[hexKey(coord)].terrain = 'desert';
          },
        },
      ],
    });
  });

  it('hot seat: switching seats rebuilds the agenda from the new viewer\'s empire', () => {
    const state = twoCityWorld(true);

    const alice = buildCouncilAgenda(state, HUMAN_A);
    const bob = buildCouncilAgenda(state, HUMAN_B);

    expect(alice.doNow.map(c => c.id)).toContain('constraint-food');
    expect(bob.doNow.map(c => c.id)).not.toContain('constraint-food');
    expectHotSeatDifferential(surface, {
      world: twoCityWorld(false),
      viewers: [HUMAN_A, HUMAN_B],
      knownOnlyTo: HUMAN_A,
      mutation: {
        label: 'Alice\'s second city starves',
        apply: s => {
          s.cities['city-b-second'].population = 6;
          for (const coord of s.cities['city-b-second'].ownedTiles) s.map.tiles[hexKey(coord)].terrain = 'desert';
        },
      },
    });
  });
});
