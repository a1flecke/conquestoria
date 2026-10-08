import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AssessmentDigest, GameState } from '@/core/types';
import { STRATEGIC_CONSTRAINT_KINDS } from '@/core/types';
import { readAssessmentDigest } from '@/systems/assessment-history';
import { buildCouncilAgenda } from '@/systems/council-system';
import { buildAssessmentDigest, buildStrategicAssessment, diffAssessment } from '@/systems/strategic-assessment';
import { CONSTRAINT_KIND_ORDER, STRATEGIC_CONSTRAINT_PRESENTATION } from '@/systems/strategic-constraint-presentation';
import { AI_A, HUMAN_A, HUMAN_B } from '../helpers/viewer-knowledge-fixtures';
import { twoCityWorld } from '../helpers/assessment-fixtures';
import { blockadeByMajorCiv } from '../helpers/blockade-fixture';

// #1357: the strategic-constraint contract. A new kind must be written down in every consumer or fail loudly, and the
// three recent pressure mechanics keep exactly one strategic surface each.
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
function sourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
}

describe('the strategic constraint kind inventory (#1357)', () => {
  it('has a presentation row for exactly every kind, with unique ranks, a label, an advisor and a why', () => {
    expect(Object.keys(STRATEGIC_CONSTRAINT_PRESENTATION).sort()).toEqual([...STRATEGIC_CONSTRAINT_KINDS].sort());
    const ranks = Object.values(STRATEGIC_CONSTRAINT_PRESENTATION).map(row => row.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    for (const kind of STRATEGIC_CONSTRAINT_KINDS) {
      const row = STRATEGIC_CONSTRAINT_PRESENTATION[kind];
      expect(row.label.length, kind).toBeGreaterThan(2);
      expect(row.why.length, kind).toBeGreaterThan(20);
      expect(row.advisor, kind).toBeTruthy();
    }
    expect([...CONSTRAINT_KIND_ORDER].sort()).toEqual([...STRATEGIC_CONSTRAINT_KINDS].sort());
  });

  it('the persisted-digest reader accepts every kind in the inventory and rejects a made-up one', () => {
    const state = twoCityWorld(false);
    state.turn = 5;
    for (const kind of STRATEGIC_CONSTRAINT_KINDS) {
      const digest: AssessmentDigest = { turn: 1, constraints: [{ kind, bucket: 'mid' }], victory: [] };
      expect(readAssessmentDigest({ ...state, assessmentDigestByCiv: { [HUMAN_A]: digest } } as GameState, HUMAN_A), kind).toBeDefined();
    }
    const bad = { turn: 1, constraints: [{ kind: 'made-up', bucket: 'mid' }], victory: [] };
    expect(readAssessmentDigest({ ...state, assessmentDigestByCiv: { [HUMAN_A]: bad } } as unknown as GameState, HUMAN_A)).toBeUndefined();
  });

  it('only the inventory itself spells the kinds out: no other source file keeps a parallel kind list', () => {
    const offenders = sourceFiles('src').filter(file => {
      if (file === 'src/core/types/council.ts') return false;
      const text = read(file);
      // Food/production/science/gold are also the four yield names, so a plain yield list is not an inventory. A list
      // naming at least one kind that is NOT a yield (unrest, supply, blockade) plus two more is a hand-kept inventory.
      const yields = new Set(['food', 'production', 'science', 'gold']);
      return [...text.matchAll(/\[[^\]\n]{0,300}\]/g)].some(match => {
        const named = STRATEGIC_CONSTRAINT_KINDS.filter(kind => match[0].includes(`'${kind}'`));
        return named.length >= 3 && named.some(kind => !yields.has(kind));
      });
    });
    expect(offenders).toEqual([]);
  });

  it('the history reader and the playtest recorder derive from the inventory instead of listing kinds', () => {
    expect(read('src/systems/assessment-history.ts')).toContain('STRATEGIC_CONSTRAINT_KINDS');
    const recorder = read('src/app/playtest-recorder.ts');
    for (const kind of STRATEGIC_CONSTRAINT_KINDS) expect(recorder, kind).not.toContain(`'${kind}'`);
    expect(recorder).not.toMatch(/blockade|levy/i);
  });
});

describe('one strategic surface per pressure mechanic (#1357)', () => {
  function pressureWorld(): GameState {
    const state = twoCityWorld(false);
    state.turn = 20;
    // Blockade of the second city.
    blockadeByMajorCiv(state, 'city-b-second');
    // The first city is restless after a conquest, with a light Imperial Levy.
    const city = state.cities['city-a-first'];
    city.unrestLevel = 1;
    city.unrestTurns = 3;
    city.conquestTurn = state.turn - 2;
    city.levy = 'light';
    // An incoming tribute demand from AI_A, and an active tribute with HUMAN_B (the receiver).
    state.pendingDiplomacyRequests = [{
      id: 'tribute:ai:1', type: 'tribute', fromCivId: AI_A, toCivId: HUMAN_A, turnIssued: state.turn,
      tribute: { demanderId: AI_A, payerId: HUMAN_A, goldPerRound: 9, rounds: 10 },
    }];
    for (const [holder, other] of [[HUMAN_A, HUMAN_B], [HUMAN_B, HUMAN_A]] as const) {
      state.civilizations[holder].diplomacy.treaties.push({
        type: 'tribute', civA: holder, civB: other, turnsRemaining: 6,
        tribute: { demanderId: HUMAN_B, payerId: HUMAN_A, goldPerRound: 7 },
      });
    }
    return state;
  }

  it('pins the truth table: tribute is a specialised card, blockade and unrest are constraints, the levy is an unrest cause', () => {
    const state = pressureWorld();
    const agenda = buildCouncilAgenda(state, HUMAN_A);
    const cards = [...agenda.doNow, ...agenda.soon, ...agenda.toWin, ...agenda.drama];
    const ids = cards.map(card => card.id);

    // Incoming demand and active tribute: specialised cards with exact terms.
    expect(cards.find(card => card.id.startsWith('tribute-demand-'))?.summary).toContain('9 gold per round');
    expect(cards.find(card => card.id.startsWith('tribute-active-paying'))?.summary).toContain('7 gold per round');
    // Blockade: exactly one constraint card; the owner knows the effect, not the fleet.
    expect(ids.filter(id => id === 'constraint-blockade')).toHaveLength(1);
    expect(JSON.stringify(cards.find(card => card.id === 'constraint-blockade'))).not.toMatch(/frigate|fleet/i);
    // Generic unrest: one constraint card whose cause list carries the canonical levy row.
    expect(ids.filter(id => id === 'constraint-unrest')).toHaveLength(1);
    expect(cards.find(card => card.id === 'constraint-unrest')?.summary).toContain('Imperial Levy');
    // No parallel levy/blockade/tribute-as-constraint cards exist.
    expect(ids.filter(id => /levy/i.test(id))).toEqual([]);
    expect(ids.filter(id => id.startsWith('constraint-tribute'))).toEqual([]);
    // The assessment itself carries blockade and unrest, and neither tribute nor levy.
    const kinds = buildStrategicAssessment(state, HUMAN_A).constraints.map(c => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(['blockade', 'unrest']));
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('gives each mechanic to its own party only', () => {
    const state = pressureWorld();
    const other = JSON.stringify(buildCouncilAgenda(state, HUMAN_B));
    expect(other).not.toContain('constraint-blockade');
    expect(other).not.toContain('Imperial Levy');
    expect(other).not.toContain('tribute-demand-');
  });
});

describe('since your last turn, from the current assessment (#1357)', () => {
  it('says a blockade began and that it is no longer a concern, never that a fleet was beaten', () => {
    const calm = twoCityWorld(false);
    const before = buildAssessmentDigest(buildStrategicAssessment(calm, HUMAN_A));
    const blockaded = twoCityWorld(false);
    blockadeByMajorCiv(blockaded, 'city-b-second');
    expect(diffAssessment(before, buildStrategicAssessment(blockaded, HUMAN_A)).map(c => c.kind)).toEqual(['new']);
    const during = buildAssessmentDigest(buildStrategicAssessment(blockaded, HUMAN_A));
    const cleared = diffAssessment(during, buildStrategicAssessment(twoCityWorld(false), HUMAN_A));
    expect(cleared.map(c => c.title)).toEqual(['The blockade is no longer a concern']);
    expect(JSON.stringify(cleared)).not.toMatch(/destroy|defeat|sunk|retreat/i);
  });

  it('keeps the digest coarse: unrest whose causes change is not re-announced, and no cause signature is stored', () => {
    const world = (levy: boolean) => {
      const state = twoCityWorld(false);
      state.turn = 20;
      const city = state.cities['city-a-first'];
      city.unrestLevel = 1;
      city.unrestTurns = 3;
      city.conquestTurn = state.turn - 2;
      if (levy) city.levy = 'light';
      return state;
    };
    const earlier = buildAssessmentDigest(buildStrategicAssessment(world(false), HUMAN_A));
    const later = buildStrategicAssessment(world(true), HUMAN_A);
    expect(diffAssessment(earlier, later).filter(change => /restless|revolt/.test(change.title))).toEqual([]);
    // The current card still explains the current causes.
    expect(later.constraints.find(c => c.kind === 'unrest')?.why).toContain('Imperial Levy');
    for (const entry of earlier.constraints) expect(Object.keys(entry).sort().every(key => ['kind', 'bucket', 'focusCityId'].includes(key))).toBe(true);
  });
});
