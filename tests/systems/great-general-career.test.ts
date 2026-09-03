import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendGeneralCareerEvent,
  describeGeneralCareerHighlights,
  getGeneralCareerForViewer,
  summarizeCivHallOfFame,
  summarizeGeneralCareer,
} from '@/systems/great-general-career';
import type { GameState, GeneralCareerEvent, GeneralHistoryEntry } from '@/core/types';

function entry(overrides: Partial<GeneralHistoryEntry> = {}): GeneralHistoryEntry {
  return { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 10, ...overrides };
}

const evs: GeneralCareerEvent[] = [
  { type: 'spawned', turn: 10 },
  { type: 'rally-used', turn: 12, unitsAffected: 2, totalHpRestored: 45 },
  { type: 'rally-used', turn: 20, unitsAffected: 1, totalHpRestored: 30 },
  { type: 'seize-used', turn: 14, unitsRefreshed: 3 },
  { type: 'last-stand-issued', turn: 16, unitsProtected: 2 },
  { type: 'unit-saved', turn: 16, via: 'last-stand', unitId: 'w1', unitType: 'warrior', remainingHp: 1, location: { q: 1, r: 1 } },
  { type: 'battle-influenced', turn: 16, combatId: 'a:d:16', reasons: ['last-stand'], location: { q: 1, r: 1 } },
  { type: 'battle-influenced', turn: 17, combatId: 'a:d:17', reasons: ['last-stand', 'seize'], location: { q: 2, r: 1 } },
  { type: 'battle-influenced', turn: 17, combatId: 'a:d:17', reasons: ['last-stand'], location: { q: 2, r: 1 } }, // dup combatId
  { type: 'city-defended', turn: 18, cityId: 'c1', cityName: 'Rome' },
  { type: 'city-defended', turn: 22, cityId: 'c1', cityName: 'Rome' }, // same city again
  { type: 'city-captured', turn: 25, cityId: 'c9', cityName: 'Alesia' },
  { type: 'final-command', turn: 30 },
  { type: 'retired', turn: 30, reason: 'charges-expended' },
];

describe('#887 summarizeGeneralCareer', () => {
  it('derives exact counts, deduping combatId and defended cityId', () => {
    const s = summarizeGeneralCareer(entry({ careerEvents: evs, outcome: 'retired', retiredTurn: 30 }));
    expect(s).toMatchObject({
      generalDefinitionId: 'gen_caesar',
      spawnedTurn: 10,
      lastActiveTurn: 30,
      status: 'retired',
      careerTurns: 20,
      battlesInfluenced: 2,      // a:d:16, a:d:17
      citiesCaptured: 1,
      uniqueCitiesDefended: 1,   // c1 once
      cityDefenseActions: 2,     // two city-defended events
      unitsSaved: 1,
      rallyUses: 2,
      seizeUses: 1,
      lastStandUses: 1,
      finalCommandUsed: true,
    });
  });

  it('tolerates an entry with no careerEvents (all zeros, active)', () => {
    const s = summarizeGeneralCareer(entry());
    expect(s.status).toBe('active');
    expect(s.battlesInfluenced).toBe(0);
    expect(s.careerTurns).toBe(0);
    expect(s.lastActiveTurn).toBe(10);
  });

  it('status is fallen for a died entry; careerTurns uses diedTurn', () => {
    const s = summarizeGeneralCareer(entry({
      careerEvents: [{ type: 'spawned', turn: 10 }, { type: 'killed', turn: 18 }],
      outcome: 'died', diedTurn: 18,
    }));
    expect(s.status).toBe('fallen');
    expect(s.careerTurns).toBe(8);
  });
});

describe('#887 appendGeneralCareerEvent', () => {
  function state(): GameState {
    return {
      turn: 5,
      civilizations: {
        player: { generalHistory: [entry({ generalDefinitionId: 'gen_caesar' })] },
        'ai-1': { generalHistory: [entry({ unitId: 'u2', generalDefinitionId: 'generated:rome:3:aa' })] },
      },
    } as unknown as GameState;
  }

  it('appends immutably to the matching entry', () => {
    const s0 = state();
    const s1 = appendGeneralCareerEvent(s0, 'player', 'gen_caesar', { type: 'spawned', turn: 5 });
    expect(s1).not.toBe(s0);
    expect(s1.civilizations.player!.generalHistory![0]!.careerEvents).toEqual([{ type: 'spawned', turn: 5 }]);
    expect(s0.civilizations.player!.generalHistory![0]!.careerEvents).toBeUndefined();
  });

  it('no-ops on a falsy generalDefinitionId (legacy Last Stand hold)', () => {
    const s0 = state();
    expect(appendGeneralCareerEvent(s0, 'player', undefined, { type: 'spawned', turn: 5 })).toBe(s0);
  });

  it('no-ops when no history entry matches (dropped by normalization)', () => {
    const s0 = state();
    expect(appendGeneralCareerEvent(s0, 'player', 'gen_wellington', { type: 'spawned', turn: 5 })).toBe(s0);
  });

  it('works for a generated General id', () => {
    const s1 = appendGeneralCareerEvent(state(), 'ai-1', 'generated:rome:3:aa', { type: 'killed', turn: 9 });
    expect(s1.civilizations['ai-1']!.generalHistory![0]!.careerEvents).toEqual([{ type: 'killed', turn: 9 }]);
  });
});

describe('#887 getGeneralCareerForViewer + summarizeCivHallOfFame', () => {
  const s = {
    civilizations: {
      player: { generalHistory: [entry({ generalDefinitionId: 'gen_caesar', careerEvents: evs })] },
      'ai-1': { generalHistory: [entry({ generalDefinitionId: 'gen_genghis' })] },
    },
  } as unknown as GameState;

  it('returns own General career', () => {
    expect(getGeneralCareerForViewer(s, 'player', 'gen_caesar')?.battlesInfluenced).toBe(2);
  });
  it('returns undefined for a General the viewer never owned', () => {
    expect(getGeneralCareerForViewer(s, 'player', 'gen_genghis')).toBeUndefined();
    expect(getGeneralCareerForViewer(s, 'ai-1', 'gen_caesar')).toBeUndefined();
  });
  it('summarizeCivHallOfFame maps the whole roster', () => {
    expect(summarizeCivHallOfFame(s.civilizations.player!).map(g => g.generalDefinitionId)).toEqual(['gen_caesar']);
  });
});

describe('#887 describeGeneralCareerHighlights', () => {
  it('is empty for a spawn-only career', () => {
    expect(describeGeneralCareerHighlights(summarizeGeneralCareer(entry()))).toBe('');
  });
  it('is a terse factual clause for a real career', () => {
    const clause = describeGeneralCareerHighlights(summarizeGeneralCareer(entry({ careerEvents: evs })));
    expect(clause).toBe(' — 1 city captured, 1 city defended, 1 unit saved, 2 battles influenced.');
  });
});

describe('#887 Phase 34 — career ledger volume stays bounded', () => {
  // Synthetic worst case: a 4-charge General fights hard for a 60-turn career —
  // every charge issued, a battle influenced most turns it was active, saves and
  // city events layered on, then both terminal events. This over-states reality
  // (no real General influences a battle every turn for 60 turns) and must still
  // land well under the sanity ceiling.
  const KNOWN_TYPES = new Set<GeneralCareerEvent['type']>([
    'spawned', 'rally-used', 'seize-used', 'last-stand-issued', 'unit-saved',
    'battle-influenced', 'city-defended', 'city-captured', 'final-command', 'retired', 'killed',
  ]);

  function syntheticLongCareer(): GeneralCareerEvent[] {
    const out: GeneralCareerEvent[] = [{ type: 'spawned', turn: 1 }];
    for (let charge = 0; charge < 4; charge += 1) {
      const t = 5 + charge * 12;
      out.push({ type: 'rally-used', turn: t, unitsAffected: 3, totalHpRestored: 40 });
      out.push({ type: 'seize-used', turn: t + 1, unitsRefreshed: 3 });
      out.push({ type: 'last-stand-issued', turn: t + 2, unitsProtected: 3 });
    }
    for (let turn = 5; turn < 60; turn += 1) {
      out.push({ type: 'battle-influenced', turn, combatId: `x:y:${turn}`, reasons: ['last-stand'], location: { q: 0, r: 0 } });
      if (turn % 3 === 0) {
        out.push({ type: 'unit-saved', turn, via: 'last-stand', unitId: `u${turn}`, unitType: 'warrior', remainingHp: 1, location: { q: 0, r: 0 } });
      }
      if (turn % 10 === 0) out.push({ type: 'city-defended', turn, cityId: `c${turn}`, cityName: `City ${turn}` });
      if (turn % 15 === 0) out.push({ type: 'city-captured', turn, cityId: `k${turn}`, cityName: `Keep ${turn}` });
    }
    out.push({ type: 'final-command', turn: 58 });
    out.push({ type: 'retired', turn: 60, reason: 'charges-expended' });
    return out;
  }

  it('an extreme synthetic career stays well under 200 events and emits no unknown (per-turn-risk) type', () => {
    const events = syntheticLongCareer();
    expect(events.length).toBeLessThan(200);
    for (const e of events) expect(KNOWN_TYPES.has(e.type)).toBe(true);
  });

  it('summarizeGeneralCareer digests that career with internally consistent counts', () => {
    const summary = summarizeGeneralCareer(entry({ careerEvents: syntheticLongCareer(), outcome: 'retired', retiredTurn: 60 }));
    expect(summary.status).toBe('retired');
    expect(summary.battlesInfluenced).toBe(55); // one distinct combatId per turn 5..59
    expect(summary.rallyUses).toBe(4);
    expect(summary.seizeUses).toBe(4);
    expect(summary.lastStandUses).toBe(4);
    expect(summary.finalCommandUsed).toBe(true);
    expect(summary.citiesCaptured).toBeGreaterThan(0);
    expect(summary.uniqueCitiesDefended).toBeGreaterThan(0);
  });
});

describe('#887 the AI never reads the career ledger', () => {
  function tsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? tsFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
  }
  it('no file under src/ai references the career ledger or its Hall of Fame view', () => {
    for (const f of tsFiles('src/ai')) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toContain('great-general-career');
      expect(src, f).not.toContain('great-general-hall-of-fame');
      expect(src, f).not.toContain('hall-of-fame-panel');
    }
  });
});
