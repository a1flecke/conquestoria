import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { buildCouncilAgenda, getCouncilInterrupt } from '@/systems/council-system';
import { buildAssessmentDigest, buildStrategicAssessment } from '@/systems/strategic-assessment';
import {
  buildStrategicOpportunities,
  MAX_STRATEGIC_OPPORTUNITIES,
  STRATEGIC_OPPORTUNITY_PRESENTATION,
} from '@/systems/strategic-opportunity-presentation';
import { declareMajorWar } from '@/systems/diplomacy-system';
import { declareWarGoal } from '@/systems/war-goal-system';
import { AI_A, AI_B, HUMAN_A, HUMAN_B } from '../helpers/viewer-knowledge-fixtures';
import { addCity, pickSites, twoCityWorld } from '../helpers/assessment-fixtures';
import { expectViewerSafety } from '../helpers/viewer-safety';

const ALL_POLICIES = { 'conscription-levy': true, 'free-trade-charter': true, 'local-autonomy-writ': true } as const;

/** A healthy two-city viewer, with enemy cities for the AI civs so a war goal is declarable. */
function world(options: { full?: boolean } = {}): GameState {
  const state = twoCityWorld(false);
  const sites = pickSites(state, 4);
  addCity(state, AI_A, sites[2], 'city-ai-a', 'grassland');
  addCity(state, AI_B, sites[3], 'city-ai-b', 'grassland');
  // Governance load is distance-from-capital sprawl, so keep the second city close enough to leave capacity free.
  const first = state.cities['city-a-first'].position;
  state.cities['city-b-second'] = { ...state.cities['city-b-second'], position: { q: first.q + 1, r: first.r } };
  // Both viewers are researching, so no science constraint muddies the agenda.
  state.civilizations[HUMAN_B].techState.currentResearch = 'pottery';
  if (options.full) state.civilizations[HUMAN_A].governancePolicies = { ...ALL_POLICIES };
  return state;
}

function atWar(state: GameState, enemy: string): GameState {
  return declareMajorWar(state, HUMAN_A, enemy, new EventBus());
}

const soonIds = (state: GameState, civ = HUMAN_A) => buildCouncilAgenda(state, civ).soon.map(card => card.id);

describe('StrategicOpportunity synthesis (#1374)', () => {
  it('a healthy empire at peace with spare capacity gets only the governance choice, in "soon"', () => {
    const agenda = buildCouncilAgenda(world(), HUMAN_A);
    const card = agenda.soon.find(c => c.id === 'governance-capacity')!;
    expect(card.advisor).toBe('chancellor');
    expect(card.bucket).toBe('soon');
    expect(card.action).toEqual({ kind: 'open-governance' });
    expect(card.actionLabel).toBe('Open Governance');
    expect(card.summary).toContain('capacity free');
    expect(agenda.doNow.find(c => c.id === 'governance-capacity')).toBeUndefined();
  });

  it('adds nothing when capacity is full and there is no war', () => {
    const state = world({ full: true });
    expect(buildStrategicAssessment(state, HUMAN_A).opportunities).toEqual([]);
    expect(soonIds(state).filter(id => id.startsWith('governance') || id.startsWith('war-objective'))).toEqual([]);
  });

  it('a war with no declared goal becomes a warchief card pointing at Diplomacy', () => {
    const state = atWar(world({ full: true }), AI_A);
    const card = buildCouncilAgenda(state, HUMAN_A).soon.find(c => c.id === `war-objective-${AI_A}`)!;
    expect(card.advisor).toBe('warchief');
    expect(card.action).toEqual({ kind: 'open-diplomacy' });
    expect(card.title).toMatch(/purpose/);
  });

  it('a satisfied goal outranks the governance choice', () => {
    let state = atWar(world(), AI_A);
    const target = state.civilizations[AI_A].cities[0];
    state = declareWarGoal(state, HUMAN_A, AI_A, 'conquer_city', target, state.turn);
    state = {
      ...state,
      cities: { ...state.cities, [target]: { ...state.cities[target], owner: HUMAN_A } },
      civilizations: {
        ...state.civilizations,
        [AI_A]: { ...state.civilizations[AI_A], cities: [] },
        [HUMAN_A]: { ...state.civilizations[HUMAN_A], cities: [...state.civilizations[HUMAN_A].cities, target] },
      },
    };
    const opportunities = buildStrategicOpportunities(state, HUMAN_A);
    expect(opportunities.map(o => o.id)).toEqual([`war-objective-${AI_A}`, 'governance-capacity']);
    expect(opportunities[0].why).toContain('worth considering');
    expect(opportunities[0].priority).toBeGreaterThan(opportunities[1].priority);
  });

  it('caps the assessment at three and the Council at two, and is deterministic', () => {
    let state = atWar(world(), AI_A);
    state = atWar(state, AI_B);
    const opportunities = buildStrategicOpportunities(state, HUMAN_A);
    expect(opportunities).toHaveLength(3);
    expect(opportunities.length).toBeLessThanOrEqual(MAX_STRATEGIC_OPPORTUNITIES);
    expect(buildStrategicOpportunities(state, HUMAN_A)).toEqual(opportunities);
    // Equal priority (two goal-less wars) breaks on id, ahead of the lower-priority governance choice.
    expect(opportunities.map(o => o.id)).toEqual([`war-objective-${AI_A}`, `war-objective-${AI_B}`, 'governance-capacity']);
    const shown = buildCouncilAgenda(state, HUMAN_A).soon.filter(c => opportunities.some(o => o.id === c.id));
    expect(shown.map(c => c.id)).toEqual([`war-objective-${AI_A}`, `war-objective-${AI_B}`]);
  });

  it('never interrupts: opportunities are not do-now cards, even on the chattiest setting', () => {
    const state = atWar(world(), AI_A);
    const agenda = buildCouncilAgenda(state, HUMAN_A);
    expect(agenda.doNow.some(c => c.id.startsWith('war-objective') || c.id === 'governance-capacity')).toBe(false);
    const interrupt = getCouncilInterrupt(state, HUMAN_A, 'chaos');
    expect(interrupt?.sourceCardId ?? '').not.toMatch(/^(war-objective|governance-capacity)/);
  });

  it('keeps constraints and opportunities separate lists with their own scales', () => {
    const assessment = buildStrategicAssessment(atWar(world(), AI_A), HUMAN_A);
    expect(assessment.opportunities.length).toBeGreaterThan(0);
    for (const opportunity of assessment.opportunities) {
      expect(assessment.constraints.some(c => c.title === opportunity.title)).toBe(false);
    }
  });

  it('has presentation metadata for every kind, with unique ranks', () => {
    const ranks = Object.values(STRATEGIC_OPPORTUNITY_PRESENTATION).map(p => p.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    for (const presentation of Object.values(STRATEGIC_OPPORTUNITY_PRESENTATION)) {
      expect(presentation.whyItMatters.length).toBeGreaterThan(0);
    }
  });

  it('is not persisted: the assessment digest has no opportunity state', () => {
    const digest = buildAssessmentDigest(buildStrategicAssessment(atWar(world(), AI_A), HUMAN_A));
    expect(Object.keys(digest).sort()).toEqual(['constraints', 'turn', 'victory']);
  });

  describe('viewer safety and hot seat', () => {
    it('hidden enemy military does not change the opportunities', () => {
      const base = atWar(world({ full: true }), AI_A);
      expectViewerSafety(
        { name: 'strategic opportunities', project: (s: GameState, viewerId: string) => buildStrategicAssessment(s, viewerId).opportunities },
        {
          world: base,
          viewerId: HUMAN_A,
          hidden: [{
            label: 'enemy fields extra hidden units',
            apply: s => {
              const civ = s.civilizations[AI_A];
              const template = Object.values(s.units)[0];
              for (let i = 0; i < 5; i++) {
                const id = `hidden-${i}`;
                s.units[id] = { ...template, id, owner: AI_A };
                civ.units.push(id);
              }
            },
          }],
          earned: [{
            label: 'viewer ends the war',
            apply: s => {
              s.civilizations[HUMAN_A].diplomacy.atWarWith = [];
              s.civilizations[AI_A].diplomacy.atWarWith = [];
            },
          }],
        },
      );
    });

    it('each hot-seat viewer gets cards from their own state only', () => {
      const state = atWar(world({ full: true }), AI_A);
      expect(soonIds(state, HUMAN_A)).toContain(`war-objective-${AI_A}`);
      expect(soonIds(state, HUMAN_B)).not.toContain(`war-objective-${AI_A}`);
      // Alice's governance state never colours Bob's agenda.
      expect(buildStrategicAssessment(state, HUMAN_A).opportunities.some(o => o.id === 'governance-capacity')).toBe(false);
      expect(buildStrategicAssessment(state, HUMAN_B).opportunities.some(o => o.id === 'governance-capacity')).toBe(true);
    });
  });
});
