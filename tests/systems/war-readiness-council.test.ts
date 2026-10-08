// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState, Unit } from '@/core/types';
import { buildCouncilAgenda, getCouncilInterrupt } from '@/systems/council-system';
import { buildAssessmentDigest, buildStrategicAssessment } from '@/systems/strategic-assessment';
import { declareMajorWar } from '@/systems/diplomacy-system';
import { declareWarGoal } from '@/systems/war-goal-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { AI_A, AI_B, HUMAN_A, HUMAN_B, setNationalIntent } from '../helpers/viewer-knowledge-fixtures';
import { addCity, pickSites, twoCityWorld } from '../helpers/assessment-fixtures';
import { createCouncilPanel } from '@/ui/council-panel';
import { expectHotSeatDifferential, expectViewerSafety } from '../helpers/viewer-safety';

/** A healthy two-city viewer with enemy cities so a war goal is declarable, and a known 6-unit army. */
function world(): GameState {
  const state = twoCityWorld(false);
  const sites = pickSites(state, 4);
  addCity(state, AI_A, sites[2], 'city-ai-a', 'grassland');
  addCity(state, AI_B, sites[3], 'city-ai-b', 'grassland');
  const first = state.cities['city-a-first'].position;
  state.cities['city-b-second'] = { ...state.cities['city-b-second'], position: { q: first.q + 1, r: first.r } };
  state.civilizations[HUMAN_B].techState.currentResearch = 'pottery';
  state.civilizations[HUMAN_A].governancePolicies = { 'conscription-levy': true, 'free-trade-charter': true, 'local-autonomy-writ': true };
  state.units = Object.fromEntries(Object.entries(state.units).filter(([, unit]) => unit.owner !== HUMAN_A));
  state.civilizations[HUMAN_A] = { ...state.civilizations[HUMAN_A], units: [] };
  for (let i = 0; i < 6; i += 1) addArmyUnit(state, HUMAN_A, i);
  return state;
}

function addArmyUnit(state: GameState, owner: string, offset: number, patch: Partial<Unit> = {}): Unit {
  const home = state.cities[state.civilizations[owner].cities[0]].position;
  const unit = { ...createUnit('warrior', owner, { q: home.q + 1, r: home.r + offset }, state.idCounters), ...patch };
  state.units[unit.id] = unit;
  state.civilizations[owner].units.push(unit.id);
  return unit;
}

function atWarWithGoal(state: GameState): GameState {
  const war = declareMajorWar(state, HUMAN_A, AI_A, new EventBus());
  return declareWarGoal(war, HUMAN_A, AI_A, 'conquer_city', war.civilizations[AI_A].cities[0], war.turn);
}

const ownUnitIds = (state: GameState, owner = HUMAN_A) => Object.values(state.units).filter(unit => unit.owner === owner).map(unit => unit.id);
function wound(state: GameState, count: number, health = 20): void {
  for (const id of ownUnitIds(state).slice(0, count)) state.units[id] = { ...state.units[id], health };
}
const warCard = (state: GameState, civ = HUMAN_A) => buildCouncilAgenda(state, civ).soon.find(card => card.id === `war-objective-${AI_A}`);

describe('war readiness in the Council (#1400)', () => {
  it('before/after: the same war aim reads as a plain reminder with a healthy army and as a recover-or-press-on choice with a worn one', () => {
    const healthy = atWarWithGoal(world());
    const before = warCard(healthy)!;
    expect(before.summary).toBe(`Your declared aim against ${healthy.civilizations[AI_A].name} is still in progress.`);

    const worn = atWarWithGoal(world());
    wound(worn, 3);
    const after = warCard(worn)!;
    expect(after.advisor).toBe('warchief');
    expect(after.bucket).toBe('soon');
    expect(after.action).toEqual({ kind: 'open-diplomacy' });
    expect(after.summary).toContain('Across your whole armed forces (not just this front), 3 of 6 units are limited: 3 badly wounded.');
    expect(after.summary).toContain('let them recover before pressing the attack, or keep fighting');
    expect(after.priority).toBeGreaterThan(before.priority);
  });

  it('never escalates a strategic choice into an emergency: no do-now card and no interrupt', () => {
    const worn = atWarWithGoal(world());
    wound(worn, 5, 5);
    const agenda = buildCouncilAgenda(worn, HUMAN_A);
    expect(agenda.doNow.some(card => card.id.startsWith('war-objective'))).toBe(false);
    expect(buildStrategicAssessment(worn, HUMAN_A).constraints.map(c => c.kind)).not.toContain('supply');
    expect(getCouncilInterrupt(worn, HUMAN_A, 'chaos')).toBeNull();
  });

  it('does not nag in peace: a worn army with no war produces no readiness advice at all', () => {
    const peace = world();
    wound(peace, 5, 5);
    const ids = buildCouncilAgenda(peace, HUMAN_A).soon.map(card => card.id);
    expect(ids.some(id => id.startsWith('war-objective'))).toBe(false);
    expect(JSON.stringify(buildCouncilAgenda(peace, HUMAN_A))).not.toContain('armed forces');
  });

  it('does not warn merely because the army is small', () => {
    const state = atWarWithGoal(world());
    state.units = Object.fromEntries(Object.entries(state.units).filter(([id, unit]) => unit.owner !== HUMAN_A || id === ownUnitIds(state)[0]));
    expect(warCard(state)!.summary).not.toContain('armed forces');
  });

  it('leaves land-supply strain to the existing supply constraint: exactly one supply card, none duplicated on the war card', () => {
    const state = atWarWithGoal(world());
    const supply = { state: 'severe', hostileUnsupportedTurns: 9, suppliedTurnsSinceRecovery: 0 } as const;
    for (const id of ownUnitIds(state)) state.units[id] = { ...state.units[id], landSupply: supply };
    const assessment = buildStrategicAssessment(state, HUMAN_A);
    expect(assessment.constraints.filter(constraint => constraint.kind === 'supply')).toHaveLength(1);
    expect(warCard(state)!.summary).not.toContain('armed forces');
    expect(warCard(state)!.summary).not.toMatch(/supply/i);
  });

  it('is not persisted: readiness changes the opportunity text but never the assessment digest', () => {
    const healthy = atWarWithGoal(world());
    const worn = atWarWithGoal(world());
    wound(worn, 3);
    expect(buildAssessmentDigest(buildStrategicAssessment(worn, HUMAN_A))).toEqual(buildAssessmentDigest(buildStrategicAssessment(healthy, HUMAN_A)));
    expect(JSON.stringify(buildAssessmentDigest(buildStrategicAssessment(worn, HUMAN_A)))).not.toMatch(/wounded|armed forces|readiness/);
  });

  it('builds the agenda without writing state, and gives byte-identical answers regardless of call history', () => {
    const worn = atWarWithGoal(world());
    wound(worn, 3);
    const before = JSON.stringify(worn);
    const first = JSON.stringify(buildCouncilAgenda(worn, HUMAN_A));
    buildCouncilAgenda(worn, HUMAN_B);
    buildStrategicAssessment(worn, HUMAN_A);
    expect(JSON.stringify(buildCouncilAgenda(worn, HUMAN_A))).toBe(first);
    expect(JSON.stringify(worn)).toBe(before);
  });

  it('is viewer-safe: nothing the opponent hides can change it, while the viewer\'s own forces do', () => {
    const worn = atWarWithGoal(world());
    wound(worn, 3);
    expectViewerSafety(
      { name: 'Council agenda with war readiness', project: (state: GameState, viewer: string) => buildCouncilAgenda(state, viewer) },
      {
        world: worn,
        viewerId: HUMAN_A,
        hidden: [
          { label: 'hidden enemy units appear', apply: state => { addArmyUnit(state, AI_A, 3); addArmyUnit(state, AI_A, 4); } },
          { label: 'hidden enemy army is wounded', apply: state => { for (const id of ownUnitIds(state, AI_A)) state.units[id].health = 5; addArmyUnit(state, AI_A, 5, { health: 5 }); } },
          { label: 'enemy private national intent changes', apply: state => setNationalIntent(state, AI_A, 'dominate') },
          { label: 'an unrelated rival is wounded', apply: state => { addArmyUnit(state, AI_B, 0, { health: 5 }); } },
        ],
        earned: [
          { label: 'own army recovers', apply: state => { for (const id of ownUnitIds(state)) state.units[id].health = 100; } },
          { label: 'one more own unit is badly wounded', apply: state => { state.units[ownUnitIds(state)[4]].health = 10; } },
        ],
      },
    );
  });

  it('isolates hot-seat seats: one seat\'s worn army reaches that seat only, and switching seats leaves no stale data', () => {
    const state = atWarWithGoal(world());
    expectHotSeatDifferential(
      { name: 'Council agenda (hot seat)', project: (world: GameState, viewer: string) => buildCouncilAgenda(world, viewer) },
      {
        world: state,
        viewers: [HUMAN_A, HUMAN_B],
        knownOnlyTo: HUMAN_A,
        mutation: { label: 'seat A\'s army is worn down', apply: world => wound(world, 3) },
      },
    );

    // A -> B -> A -> B on one world: every answer equals a fresh call (no cross-seat cache).
    wound(state, 3);
    const a1 = JSON.stringify(buildCouncilAgenda(state, HUMAN_A));
    const b1 = JSON.stringify(buildCouncilAgenda(state, HUMAN_B));
    expect(JSON.stringify(buildCouncilAgenda(state, HUMAN_A))).toBe(a1);
    expect(JSON.stringify(buildCouncilAgenda(state, HUMAN_B))).toBe(b1);
    expect(a1).toContain('armed forces');
    expect(b1).not.toContain('armed forces');
  });

  it('renders in the real Council panel and its existing Diplomacy button dispatches the typed action (no new button)', () => {
    const worn = atWarWithGoal(world());
    wound(worn, 3);
    worn.currentPlayer = HUMAN_A;
    const container = document.createElement('div');
    const onCardAction = vi.fn();
    const panel = createCouncilPanel(container, worn, { onClose: () => {}, onTalkLevelChange: () => {}, onCardAction });
    expect(panel.textContent).toContain('Across your whole armed forces (not just this front), 3 of 6 units are limited');
    const buttons = [...panel.querySelectorAll('button')].filter(button => button.textContent === 'Open Diplomacy');
    expect(buttons.length).toBeGreaterThan(0);
    buttons[0].click();
    expect(onCardAction).toHaveBeenCalledWith(`war-objective-${AI_A}`, { kind: 'open-diplomacy' });
  });
});
