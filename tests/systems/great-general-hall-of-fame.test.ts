import { describe, it, expect } from 'vitest';
import type { GeneralCareerEvent, GeneralHistoryEntry } from '@/core/types';
import {
  classifyCareerEventImportance,
  describeMoment,
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
