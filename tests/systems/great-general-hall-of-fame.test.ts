import { describe, it, expect } from 'vitest';
import type { GameState, GeneralCareerEvent, GeneralHistoryEntry } from '@/core/types';
import {
  classifyCareerEventImportance,
  describeMoment,
  getHallOfFameForViewer,
  selectMemorableMoments,
} from '@/systems/great-general-hall-of-fame';

function entry(careerEvents: GeneralCareerEvent[], over: Partial<GeneralHistoryEntry> = {}): GeneralHistoryEntry {
  return { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 5, careerEvents, ...over };
}

describe('classifyCareerEventImportance', () => {
  it('ranks city events highest, then final command, then unit-saved', () => {
    expect(classifyCareerEventImportance({ type: 'city-captured', turn: 1, cityId: 'c', cityName: 'Thebes' })).toBe(5);
    expect(classifyCareerEventImportance({ type: 'city-defended', turn: 1, cityId: 'c', cityName: 'Thebes' })).toBe(5);
    expect(classifyCareerEventImportance({ type: 'final-command', turn: 1 })).toBe(4);
    expect(classifyCareerEventImportance({ type: 'unit-saved', turn: 1, via: 'last-stand', unitId: 'x', unitType: 'warrior', remainingHp: 1, location: { q: 0, r: 0 } })).toBe(3);
  });

  it('ranks a two-reason battle above a one-reason battle', () => {
    expect(classifyCareerEventImportance({ type: 'battle-influenced', turn: 1, combatId: 'a:b:1', reasons: ['last-stand', 'seize'], location: { q: 0, r: 0 } })).toBe(2);
    expect(classifyCareerEventImportance({ type: 'battle-influenced', turn: 1, combatId: 'a:b:1', reasons: ['last-stand'], location: { q: 0, r: 0 } })).toBe(1);
  });

  it('ranks routine ability use and any unrecognised future type at 0', () => {
    expect(classifyCareerEventImportance({ type: 'rally-used', turn: 1, unitsAffected: 2, totalHpRestored: 20 })).toBe(0);
    expect(classifyCareerEventImportance({ type: 'seize-used', turn: 1, unitsRefreshed: 2 })).toBe(0);
    expect(classifyCareerEventImportance({ type: 'last-stand-issued', turn: 1, unitsProtected: 2 })).toBe(0);
    expect(classifyCareerEventImportance({ type: 'spawned', turn: 1 })).toBe(0);
    expect(classifyCareerEventImportance({ type: 'future-thing', turn: 1 } as unknown as GeneralCareerEvent)).toBe(0);
  });
});

describe('describeMoment', () => {
  it('produces plain, coordinate-free text for each mapped kind', () => {
    expect(describeMoment({ type: 'city-captured', turn: 1, cityId: 'c', cityName: 'Thebes' })).toBe('captured Thebes');
    expect(describeMoment({ type: 'city-defended', turn: 1, cityId: 'c', cityName: 'Memphis' })).toBe('defended Memphis');
    expect(describeMoment({ type: 'unit-saved', turn: 1, via: 'last-stand', unitId: 'x', unitType: 'warrior', remainingHp: 1, location: { q: 3, r: -2 } }))
      .toBe('pulled a Warrior back from the brink');
    expect(describeMoment({ type: 'final-command', turn: 1 })).toBe('gave their final command');
    expect(describeMoment({ type: 'battle-influenced', turn: 1, combatId: 'a:b:1', reasons: ['last-stand', 'seize'], location: { q: 0, r: 0 } })).toBe('turned a desperate battle');
    expect(describeMoment({ type: 'battle-influenced', turn: 1, combatId: 'a:b:1', reasons: ['seize'], location: { q: 0, r: 0 } })).toBe('helped win a hard-fought battle');
  });

  it('returns null for an unrecognised or bookend/routine kind', () => {
    expect(describeMoment({ type: 'spawned', turn: 1 })).toBeNull();
    expect(describeMoment({ type: 'rally-used', turn: 1, unitsAffected: 1, totalHpRestored: 5 })).toBeNull();
    expect(describeMoment({ type: 'future-thing', turn: 1 } as unknown as GeneralCareerEvent)).toBeNull();
  });

  it('never emits a raw axial-coordinate substring', () => {
    const m = describeMoment({ type: 'unit-saved', turn: 1, via: 'last-stand', unitId: 'x', unitType: 'archer', remainingHp: 1, location: { q: 12, r: -8 } });
    expect(m).not.toMatch(/\(-?\d+,\s*-?\d+\)/);
  });
});

describe('selectMemorableMoments', () => {
  it('caps at 5, picks highest importance first, then returns them chronologically', () => {
    const events: GeneralCareerEvent[] = [
      { type: 'spawned', turn: 1 },
      { type: 'battle-influenced', turn: 3, combatId: 'a:b:3', reasons: ['seize'], location: { q: 0, r: 0 } },
      { type: 'battle-influenced', turn: 4, combatId: 'a:b:4', reasons: ['last-stand'], location: { q: 0, r: 0 } },
      { type: 'city-captured', turn: 10, cityId: 'c1', cityName: 'Thebes' },
      { type: 'unit-saved', turn: 8, via: 'last-stand', unitId: 'x', unitType: 'warrior', remainingHp: 1, location: { q: 0, r: 0 } },
      { type: 'city-defended', turn: 12, cityId: 'c2', cityName: 'Memphis' },
      { type: 'final-command', turn: 14 },
      { type: 'battle-influenced', turn: 15, combatId: 'a:b:15', reasons: ['seize'], location: { q: 0, r: 0 } },
    ];
    const moments = selectMemorableMoments(entry(events));
    expect(moments).toHaveLength(5);
    // ranked pick = {city-captured t10, city-defended t12, final-command t14, unit-saved t8, battle t3}, then chronological
    expect(moments.map(m => m.turn)).toEqual([3, 8, 10, 12, 14]);
    expect(moments.map(m => m.text)).toContain('captured Thebes');
    expect(moments.map(m => m.text)).toContain('defended Memphis');
    expect(moments.map(m => m.text)).toContain('gave their final command');
  });

  it('city events and unit-saved always beat single-reason battle-influenced when capped', () => {
    const events: GeneralCareerEvent[] = [
      ...Array.from({ length: 6 }, (_v, i): GeneralCareerEvent => ({ type: 'battle-influenced', turn: 2 + i, combatId: `a:b:${i}`, reasons: ['seize'], location: { q: 0, r: 0 } })),
      { type: 'city-captured', turn: 20, cityId: 'c1', cityName: 'Thebes' },
    ];
    const moments = selectMemorableMoments(entry(events));
    expect(moments.map(m => m.text)).toContain('captured Thebes');
  });

  it('drops an unrecognised event without throwing', () => {
    const events = [
      { type: 'future-thing', turn: 4 },
      { type: 'city-captured', turn: 5, cityId: 'c', cityName: 'Thebes' },
    ] as unknown as GeneralCareerEvent[];
    expect(selectMemorableMoments(entry(events)).map(m => m.text)).toEqual(['captured Thebes']);
  });

  it('synthesises one "steadied the ranks" moment for a General with only ability uses', () => {
    const events: GeneralCareerEvent[] = [
      { type: 'spawned', turn: 5 },
      { type: 'rally-used', turn: 7, unitsAffected: 3, totalHpRestored: 40 },
      { type: 'seize-used', turn: 9, unitsRefreshed: 2 },
    ];
    expect(selectMemorableMoments(entry(events))).toEqual([{ turn: 5, text: 'steadied the ranks through 2 heroic commands' }]);
  });

  it('returns [] for a career with only a spawn event', () => {
    expect(selectMemorableMoments(entry([{ type: 'spawned', turn: 5 }]))).toEqual([]);
  });
});

function civState(generalHistory: GeneralHistoryEntry[]): GameState {
  return {
    generatedGenerals: {},
    civilizations: {
      player: { id: 'player', generalHistory } as never,
      'ai-1': { id: 'ai-1', generalHistory: [
        { unitId: 'e1', generalDefinitionId: 'gen_ramesses', spawnedTurn: 2, careerEvents: [{ type: 'spawned', turn: 2 }] },
      ] } as never,
    },
  } as unknown as GameState;
}

describe('getHallOfFameForViewer', () => {
  it('returns one entry per generalHistory entry, active first then most-recent-end first', () => {
    const history: GeneralHistoryEntry[] = [
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, outcome: 'died', diedTurn: 20,
        careerEvents: [{ type: 'spawned', turn: 4 }, { type: 'city-captured', turn: 10, cityId: 'c', cityName: 'Thebes' }, { type: 'killed', turn: 20 }] },
      { unitId: 'u2', generalDefinitionId: 'gen_boudica', spawnedTurn: 25, outcome: 'retired', retiredTurn: 40,
        careerEvents: [{ type: 'spawned', turn: 25 }, { type: 'retired', turn: 40, reason: 'charges-expended' }] },
      { unitId: 'u3', generalDefinitionId: 'gen_hannibal', spawnedTurn: 45,
        careerEvents: [{ type: 'spawned', turn: 45 }] },
    ];
    const entries = getHallOfFameForViewer(civState(history), 'player');
    expect(entries.map(e => e.generalDefinitionId)).toEqual(['gen_hannibal', 'gen_boudica', 'gen_caesar']);
    expect(entries.map(e => e.status)).toEqual(['active', 'retired', 'fallen']);
    expect(entries[0].bookendEnd).toBeUndefined();
    expect(entries[1].bookendEnd).toBe('Turn 40 — retired from service');
    expect(entries[2].bookendEnd).toBe('Turn 20 — fell in battle');
    expect(entries[2].bookendStart).toBe('Turn 4 — took command');
    expect(entries[2].moments.map(m => m.text)).toEqual(['captured Thebes']);
    expect(entries[2].statLine).toBe('1 city captured.');
  });

  it('returns [] when the civ has no general history', () => {
    expect(getHallOfFameForViewer(civState([]), 'player')).toEqual([]);
  });

  it('never returns another civ\'s Generals', () => {
    const entries = getHallOfFameForViewer(civState([
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, careerEvents: [{ type: 'spawned', turn: 4 }] },
    ]), 'player');
    expect(entries).toHaveLength(1);
    expect(entries.some(e => e.generalDefinitionId === 'gen_ramesses')).toBe(false);
  });

  it('renders a generated officer with no profile and no specialty line', () => {
    const genId = 'generated:rome:3:abcd1234';
    const state = {
      generatedGenerals: { [genId]: {
        id: genId, name: 'Servius Longinus', civTypeEligibility: ['rome'], era: 3,
        descriptor: 'Legatus. A Roman field commander.', portraitIcon: '🦅', origin: 'generated',
        commandRange: 2, commandCapacity: 3, abilityIds: ['rally', 'seize_the_moment', 'last_stand'],
        maxCommandCharges: 3, cooldownTurns: 10,
      } },
      civilizations: { player: { id: 'player', generalHistory: [
        { unitId: 'u1', generalDefinitionId: genId, spawnedTurn: 3, careerEvents: [{ type: 'spawned', turn: 3 }] },
      ] } as never },
    } as unknown as GameState;
    const [e] = getHallOfFameForViewer(state, 'player');
    expect(e.name).toBe('Servius Longinus');
    expect(e.profile).toBeUndefined();
    expect(e.specialtyLine).toBeUndefined();
  });

  it('renders a "forgotten commander" fallback card for an unresolvable definition id', () => {
    const [e] = getHallOfFameForViewer(civState([
      { unitId: 'u1', generalDefinitionId: 'gen_deleted_in_a_later_release', spawnedTurn: 4, outcome: 'died', diedTurn: 9,
        careerEvents: [{ type: 'spawned', turn: 4 }, { type: 'city-captured', turn: 6, cityId: 'c', cityName: 'Ur' }, { type: 'killed', turn: 9 }] },
    ]), 'player');
    expect(e.name).toBe('A forgotten commander');
    expect(e.portraitIcon).toBe('');
    expect(e.era).toBeNull();
    expect(e.descriptor).toBe('');
    expect(e.profile).toBeUndefined();
    expect(e.moments.map(m => m.text)).toEqual(['captured Ur']);
    expect(e.bookendEnd).toBe('Turn 9 — fell in battle');
  });

  it('carries an authored profile and specialty line for an authored General', () => {
    const [e] = getHallOfFameForViewer(civState([
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, careerEvents: [{ type: 'spawned', turn: 4 }] },
    ]), 'player');
    expect(e.profile?.kind).toBe('historical');
    expect(typeof e.profile?.summary).toBe('string');
    expect(e.specialtyLine && e.specialtyLine.includes(' — ')).toBe(true);
  });

  it('gives an all-zeros active General an empty statLine and empty moments', () => {
    const [e] = getHallOfFameForViewer(civState([
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, careerEvents: [{ type: 'spawned', turn: 4 }] },
    ]), 'player');
    expect(e.statLine).toBe('');
    expect(e.moments).toEqual([]);
    expect(e.status).toBe('active');
  });
});
