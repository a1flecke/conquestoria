import { describe, expect, it } from 'vitest';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import {
  AUTHORED_CRESTS,
  getGeneralEraTier,
  getGeneralIdentityForUnit,
  getGeneralPresentation,
} from '@/systems/great-general-presentation';
import { CULTURE_FAMILIES, generateFallbackGeneralCandidates } from '@/systems/great-general-fallback-content';
import { CREST_FIELDS, GENERAL_GLYPHS } from '@/ui/general-portrait-glyphs';
import { createNewGame } from '@/core/game-state';
import type { GeneralDefinition, Unit } from '@/core/types';

const HEX = /^#[0-9a-fA-F]{6}$/;

function generated(civType: string, era: number): GeneralDefinition {
  const [officer] = generateFallbackGeneralCandidates('game-889', civType, era, 7, 1, []);
  return officer!;
}

describe('Great General presentation identity (#889)', () => {
  it('every authored General has exactly one canonical crest row, and no row is stale', () => {
    const ids = GENERAL_DEFINITIONS.map(g => g.id).sort();
    expect(Object.keys(AUTHORED_CRESTS).sort()).toEqual(ids);
  });

  it('no two authored Generals share a crest (motif + shape + primary colour is unique across the roster)', () => {
    const seen = new Map<string, string>();
    for (const def of GENERAL_DEFINITIONS) {
      const p = getGeneralPresentation(def);
      const key = `${p.motif}|${p.shape}|${p.primary.toLowerCase()}`;
      expect(seen.get(key), `${def.id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, def.id);
    }
  });

  it('fixes what the emoji could not: Generals that shared an icon no longer share a look', () => {
    const shared = new Map<string, string[]>();
    for (const def of GENERAL_DEFINITIONS) shared.set(def.portraitIcon, [...(shared.get(def.portraitIcon) ?? []), def.id]);
    const collisions = [...shared.values()].filter(ids => ids.length > 1);
    expect(collisions.length, 'the roster really did reuse icons; this test only means something while that is true').toBeGreaterThan(0);
    for (const ids of collisions) {
      const looks = ids.map(id => {
        const p = getGeneralPresentation(GENERAL_DEFINITIONS.find(g => g.id === id)!);
        return `${p.motif}|${p.shape}|${p.primary}`;
      });
      expect(new Set(looks).size).toBe(looks.length);
    }
  });

  it('every crest can be drawn: known motif, known shape, well-formed colours', () => {
    const all: GeneralDefinition[] = [
      ...GENERAL_DEFINITIONS,
      ...Object.keys(CULTURE_FAMILIES).map(civ => generated(civ, 3)),
      generated('unknown-civ', 3),
    ];
    for (const def of all) {
      const p = getGeneralPresentation(def);
      expect(GENERAL_GLYPHS[p.motif], `${def.id} motif ${p.motif}`).toBeDefined();
      expect(CREST_FIELDS[p.shape], `${def.id} shape ${p.shape}`).toBeDefined();
      expect(p.primary).toMatch(HEX);
      expect(p.secondary).toMatch(HEX);
      expect(p.fallbackIcon.length, 'the legacy emoji stays as the graceful fallback').toBeGreaterThan(0);
    }
  });

  it('marks authored and generated identities honestly, and a generated id never borrows an authored crest', () => {
    const authored = GENERAL_DEFINITIONS.find(g => g.id === 'gen_caesar')!;
    expect(getGeneralPresentation(authored).source).toBe('authored');
    // A generated officer that (impossibly) reused an authored id still resolves through the generated path.
    const impostor: GeneralDefinition = { ...authored, origin: 'generated' };
    expect(getGeneralPresentation(impostor).source).toBe('generated');
  });

  it('a generated officer takes its crest from culture family and era, deterministically', () => {
    const rome = generated('rome', 3);
    const again = generated('rome', 3);
    expect(getGeneralPresentation(rome)).toEqual(getGeneralPresentation(again));
    const viking = generated('viking', 3);
    expect(getGeneralPresentation(rome).motif).not.toBe(getGeneralPresentation(viking).motif);
    expect(getGeneralPresentation(rome).source).toBe('generated');
    // Same culture, later era: same emblem, more pips.
    const late = generated('rome', 8);
    expect(getGeneralPresentation(late).motif).toBe(getGeneralPresentation(rome).motif);
    expect(getGeneralPresentation(late).eraTier).toBeGreaterThan(getGeneralPresentation(rome).eraTier);
  });

  it('an unknown culture degrades to the generic crest instead of failing', () => {
    const p = getGeneralPresentation(generated('no-such-civ', 2));
    expect(p.source).toBe('generated');
    expect(GENERAL_GLYPHS[p.motif]).toBeDefined();
  });

  it('era tiers are 1-4 and monotonic across every era the game has', () => {
    let previous = 0;
    for (let era = 1; era <= 13; era++) {
      const tier = getGeneralEraTier(era);
      expect(tier).toBeGreaterThanOrEqual(previous);
      expect([1, 2, 3, 4]).toContain(tier);
      previous = tier;
    }
    expect(getGeneralEraTier(1)).toBe(1);
    expect(getGeneralEraTier(13)).toBe(4);
  });

  it('resolves a unit\'s identity through the canonical resolver (authored and generated) and ignores non-Generals', () => {
    const state = createNewGame(undefined, 'general-identity-889', 'small');
    const officer = generated('rome', 3);
    (state as { generatedGenerals?: Record<string, GeneralDefinition> }).generatedGenerals = { [officer.id]: officer };
    const unit = (id: string, extra: Partial<Unit>): Unit => ({ ...Object.values(state.units)[0]!, id, ...extra });
    state.units = {
      a: unit('a', { type: 'great_general', generalDefinitionId: 'gen_caesar' }),
      b: unit('b', { type: 'great_general', generalDefinitionId: officer.id }),
      c: unit('c', { type: 'warrior' }),
      d: unit('d', { type: 'great_general', generalDefinitionId: 'gen_does_not_exist' }),
    };
    expect(getGeneralIdentityForUnit(state, 'a')?.name).toBe('Julius Caesar');
    expect(getGeneralIdentityForUnit(state, 'a')?.presentation.source).toBe('authored');
    expect(getGeneralIdentityForUnit(state, 'b')?.presentation.source).toBe('generated');
    expect(getGeneralIdentityForUnit(state, 'c')).toBeUndefined();
    expect(getGeneralIdentityForUnit(state, 'd')).toBeUndefined();
    expect(getGeneralIdentityForUnit(state, 'missing')).toBeUndefined();
  });

  it('is derived, not stored: the presentation carries nothing a save would need', () => {
    const json = JSON.stringify(getGeneralPresentation(GENERAL_DEFINITIONS[0]!));
    expect(JSON.parse(json)).toEqual(getGeneralPresentation(GENERAL_DEFINITIONS[0]!));
  });
});
