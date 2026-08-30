import { describe, it, expect } from 'vitest';
import { unrestRecommendationCopy } from '@/ui/unrest-guidance-copy';
import type { UnrestRecommendation, UnrestRecommendationKind } from '@/systems/unrest-guidance';

const rec = (p: Partial<UnrestRecommendation>): UnrestRecommendation =>
  ({ kind: 'appease-or-concede', rowLabel: '', amount: 0, availability: 'now', ...p });

describe('unrestRecommendationCopy', () => {
  it('build-courthouse names the City screen', () => {
    const { icon, text } = unrestRecommendationCopy(rec({ kind: 'build-courthouse', rowLabel: 'Empire overextension', amount: 18 }));
    expect(icon).toBe('⚖️');
    expect(text).toMatch(/courthouse/i);
    expect(text).toMatch(/city screen/i);
  });

  it('research-magistracy names the Tech screen and says "first"', () => {
    const { text } = unrestRecommendationCopy(rec({ kind: 'research-magistracy', availability: 'research-first' }));
    expect(text).toMatch(/magistracy/i);
    expect(text).toMatch(/tech screen/i);
    expect(text).toMatch(/first/i);
  });

  it('make-peace states the number of enemies from params.warCivIds', () => {
    const { text } = unrestRecommendationCopy(rec({ kind: 'make-peace', rowLabel: 'War weariness', amount: 24, params: { warCivIds: ['a', 'b'] } }));
    expect(text).toMatch(/\b2\b/);
    expect(text).toMatch(/diplomacy/i);
  });

  it('make-peace uses singular "empire" for one enemy', () => {
    const { text } = unrestRecommendationCopy(rec({ kind: 'make-peace', params: { warCivIds: ['a'] } }));
    expect(text).toMatch(/1 empire\b/);
  });

  it('await-conquest-settle states the turns left and is self-contained (no tech jargon)', () => {
    const { text } = unrestRecommendationCopy(rec({ kind: 'await-conquest-settle', params: { turnsLeft: 6 } }));
    expect(text).toMatch(/\b6\b/);
    expect(text).not.toMatch(/constitutional law/i);
  });

  it('research-constitutional-law is framed as a "later" secondary note, not a now-action', () => {
    const { text } = unrestRecommendationCopy(rec({ kind: 'research-constitutional-law', availability: 'research-first' }));
    expect(text).toMatch(/constitutional law/i);
    expect(text).toMatch(/later/i);
    expect(text).toMatch(/tech screen/i);
  });

  it('every kind returns a non-empty icon and text', () => {
    const kinds: UnrestRecommendationKind[] = [
      'build-courthouse', 'research-magistracy', 'garrison-unit', 'train-garrison-unit',
      'make-peace', 'await-conquest-settle', 'research-constitutional-law', 'fix-economy',
      'counter-espionage', 'stabilise-contagion-source', 'build-faith-building',
      'acquire-luxury', 'build-happiness-building', 'appease-or-concede',
    ];
    for (const kind of kinds) {
      const { icon, text } = unrestRecommendationCopy(rec({ kind }));
      expect(icon.length, kind).toBeGreaterThan(0);
      expect(text.length, kind).toBeGreaterThan(0);
    }
  });

  it('build-faith-building copy differs between now and blocked', () => {
    const now = unrestRecommendationCopy(rec({ kind: 'build-faith-building', availability: 'now' })).text;
    const blocked = unrestRecommendationCopy(rec({ kind: 'build-faith-building', availability: 'blocked' })).text;
    expect(now).not.toBe(blocked);
    expect(blocked).toMatch(/philosophy/i);
  });
});
