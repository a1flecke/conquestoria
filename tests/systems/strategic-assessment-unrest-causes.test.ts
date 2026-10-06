import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameState } from '@/core/types';
import { getTopUnrestPressureCauses, getUnrestPressureBreakdown } from '@/systems/faction-pressure';
import { buildCouncilAgenda } from '@/systems/council-system';
import { buildStrategicAssessment } from '@/systems/strategic-assessment';
import { AI_A, HUMAN_A } from '../helpers/viewer-knowledge-fixtures';
import { twoCityWorld } from '../helpers/assessment-fixtures';

// #1356: the unrest constraint explains itself from the canonical pressure rows, and only from them.
const CITY = 'city-a-first';

function restless(level: 1 | 2 = 1): GameState {
  const state = twoCityWorld(false);
  state.turn = 20;
  state.cities[CITY].unrestLevel = level;
  state.cities[CITY].unrestTurns = 3;
  return state;
}

const unrest = (state: GameState) => buildStrategicAssessment(state, HUMAN_A).constraints.find(c => c.kind === 'unrest')!;

describe('the unrest cause helper (#1356)', () => {
  it('keeps only positive rows, strongest first, at most two, ties by label', () => {
    const rows = [
      { label: 'Luxury resources', amount: -6 },
      { label: 'War weariness', amount: 8 },
      { label: 'Recent conquest', amount: 25 },
      { label: 'Economic strain', amount: 8 },
      { label: 'Governor', amount: -6 },
    ];
    expect(getTopUnrestPressureCauses(rows)).toEqual([
      { label: 'Recent conquest', amount: 25 },
      { label: 'Economic strain', amount: 8 },
    ]);
    expect(getTopUnrestPressureCauses([...rows].reverse())).toEqual(getTopUnrestPressureCauses(rows));
  });

  it('never treats relief as a cause and does not mutate its input', () => {
    const rows = [{ label: 'Courthouse relief', amount: -4 }, { label: 'Luxury resources', amount: -2 }];
    const before = JSON.stringify(rows);
    expect(getTopUnrestPressureCauses(rows)).toEqual([]);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe('unrest copy comes from the canonical pressure rows (#1356)', () => {
  it('keeps the title, destination and severity exactly as before and falls back to the generic copy with no cause', () => {
    const state = restless();
    const before = unrest(state);
    expect(before.title).toBe(`${state.cities[CITY].name} is restless`);
    expect(before.destination).toEqual({ kind: 'open-city', cityId: CITY });
    expect(before.severity).toBe(55 + 3 * 3);
    const rows = getUnrestPressureBreakdown(CITY, state);
    if (rows.every(row => row.amount <= 0)) expect(before.why).not.toContain('pressure');
    expect(unrest(restless(2)).severity).toBe(85 + 3);
  });

  it('names Recent conquest from its canonical row, with the canonical amount', () => {
    const state = restless();
    state.cities[CITY].conquestTurn = state.turn - 2;
    const row = getUnrestPressureBreakdown(CITY, state).find(r => r.label === 'Recent conquest')!;
    expect(row.amount).toBeGreaterThan(0);
    expect(unrest(state).why).toContain(`Recent conquest (+${row.amount})`);
  });

  it('shows Imperial Levy through its own row alongside Recent conquest, and drops it when the levy goes', () => {
    const state = restless();
    state.cities[CITY].conquestTurn = state.turn - 2;
    state.cities[CITY].levy = 'light';
    const levy = getUnrestPressureBreakdown(CITY, state).find(r => r.label === 'Imperial Levy')!;
    expect(levy.amount).toBeGreaterThan(0);
    expect(unrest(state).why).toContain(`Imperial Levy (+${levy.amount})`);
    expect(unrest(state).why).toContain('Recent conquest');
    delete state.cities[CITY].levy;
    expect(unrest(state).why).not.toContain('Imperial Levy');
  });

  it('does not promote the levy above a larger real pressure, and shows only the two strongest', () => {
    const state = restless();
    state.cities[CITY].conquestTurn = state.turn - 2;
    state.cities[CITY].levy = 'light';
    state.civilizations[HUMAN_A].diplomacy.atWarWith = [AI_A];
    state.civilizations[AI_A].diplomacy.atWarWith = [HUMAN_A];
    const rows = getTopUnrestPressureCauses(getUnrestPressureBreakdown(CITY, state));
    expect(rows).toHaveLength(2);
    const why = unrest(state).why;
    expect(why).toContain(`${rows[0].label} (+${rows[0].amount})`);
    expect(why).toContain(`${rows[1].label} (+${rows[1].amount})`);
    const all = getUnrestPressureBreakdown(CITY, state).filter(r => r.amount > 0);
    for (const hidden of all.slice(2)) expect(why).not.toContain(hidden.label);
  });

  it('reflects war weariness', () => {
    const state = restless();
    state.civilizations[HUMAN_A].diplomacy.atWarWith = [AI_A];
    state.civilizations[AI_A].diplomacy.atWarWith = [HUMAN_A];
    const row = getUnrestPressureBreakdown(CITY, state).find(r => r.label === 'War weariness')!;
    expect(unrest(state).why).toContain(`War weariness (+${row.amount})`);
  });

  it('changes when the canonical row changes', () => {
    const state = restless();
    state.cities[CITY].conquestTurn = state.turn - 2;
    const first = unrest(state).why;
    state.civilizations[HUMAN_A].techState.completed = [...state.civilizations[HUMAN_A].techState.completed, 'constitutional-law'];
    const halved = getUnrestPressureBreakdown(CITY, state).find(r => r.label === 'Recent conquest')!;
    expect(unrest(state).why).toContain(`Recent conquest (+${halved.amount})`);
    expect(unrest(state).why).not.toBe(first);
  });

  it('reaches the Council card unchanged', () => {
    const state = restless();
    state.cities[CITY].conquestTurn = state.turn - 2;
    const agenda = buildCouncilAgenda(state, HUMAN_A);
    const card = [...agenda.doNow, ...agenda.soon].find(c => c.id === 'constraint-unrest')!;
    expect(card.summary).toContain('Recent conquest');
  });

  it('is deterministic and does not mutate the state', () => {
    const state = restless();
    state.cities[CITY].conquestTurn = state.turn - 2;
    const before = JSON.stringify(state);
    expect(unrest(state)).toEqual(unrest(state));
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('strategic-assessment does not duplicate pressure math (#1356)', () => {
  it('has no knowledge of any individual pressure row or levy field', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/systems/strategic-assessment.ts'), 'utf8');
    for (const forbidden of ['Imperial Levy', 'Recent conquest', 'War weariness', 'conquestTurn', '.levy', 'getCityLevyUnrestAmount', 'spyUnrestBonus']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).toContain('getUnrestPressureBreakdown');
    expect(source).toContain('getTopUnrestPressureCauses');
  });
});
