import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getUnitSpriteV2, isV2NativeUnit } from '@/renderer/sprites/v2/index';
import { isPngUnit } from '@/renderer/sprites/png/png-sprite-catalog';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';

/**
 * #759 batch 2: the Grenadier is an original native-v2 sprite (not a painted strip). The Cannon is a painted strip
 * (#1627), so it is served by the PNG player and keeps only its live SVG fallback.
 */
const FACTIONS = ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate'];
const ROOT = resolve(__dirname, '../../../..');

/** Class names present in a sprite string, so assertions do not depend on attribute order or whitespace. */
function classes(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  return out;
}

describe('Grenadier native-v2 art (#759)', () => {
  it('is native v2, not a painted strip, and keeps its live SVG fallback', () => {
    expect(isV2NativeUnit('grenadier')).toBe(true);
    expect(isPngUnit('grenadier')).toBe(false);
    expect('grenadier' in UNIT_SPRITE_CATALOG).toBe(true);
  });

  it('returns complete, well-formed markup for every faction family', () => {
    for (const faction of FACTIONS) {
      const html = getUnitSpriteV2('grenadier', faction, '#c0392b')!;
      expect(html, faction).toContain('cq-sprite-wrap cq-v2');
      expect(html).toContain('data-kind-variant="grenadier"');
      expect(html).toContain('data-state="idle"');
      expect(html).toContain('width="100%" height="100%"');
      // one SVG, balanced tags, and no HTML nested inside the SVG
      expect(html.match(/<svg\b/g)).toHaveLength(1);
      expect(html.match(/<\/svg>/g)).toHaveLength(1);
      expect(html).not.toMatch(/<svg\b[\s\S]*<div\b/);
      expect(html.match(/<g\b/g)!.length).toBe(html.match(/<\/g>/g)!.length);
    }
  });

  it('exposes the four damage-tier groups and the shared figure hook', () => {
    const c = classes(getUnitSpriteV2('grenadier', 'imperials')!);
    for (const hook of ['cq-sprite-figure', 'cq-shadow', 'cq-wound-1', 'cq-wound-2', 'cq-wound-3']) {
      expect(c.has(hook), `grenadier lacks ${hook}`).toBe(true);
    }
  });

  it('has articulated legs and arms, a throwing hand and the throw effects', () => {
    const c = classes(getUnitSpriteV2('grenadier', 'imperials')!);
    for (const hook of ['cq-leg-l', 'cq-leg-r', 'cq-arm-l', 'cq-arm-r', 'cq-plume', 'cq-grenade-held', 'cq-grenade-flight', 'cq-grenade-burst']) {
      expect(c.has(hook), hook).toBe(true);
    }
  });

  it('an animated group never also carries an SVG transform attribute (the wrapper rule)', () => {
    const html = getUnitSpriteV2('grenadier', 'imperials')!;
    for (const tag of html.match(/<g\b[^>]*>/g)!) {
      if (/class="[^"]*\bcq-(?:grenade-|leg-|arm-|plume)/.test(tag)) {
        expect(tag, tag).not.toMatch(/\btransform=/);
      }
    }
  });

  it('faction colour is preserved: different families produce different markup, minor civs get their own colour', () => {
    expect(getUnitSpriteV2('grenadier', 'imperials')).not.toBe(getUnitSpriteV2('grenadier', 'vikings'));
    // an owner that is not an archetype family (a minor civ) still renders, from its own colour
    const minor = getUnitSpriteV2('grenadier', 'city-state-x', '#7a5a16')!;
    expect(minor).toContain('cq-sprite-wrap');
    expect(minor.toLowerCase()).toContain('#7a5a16');
    // and with no colour at all it falls back to the neutral palette rather than failing
    expect(getUnitSpriteV2('grenadier', 'barbarian', '')).toContain('cq-sprite-wrap');
  });

  it('its stylesheet rules are scoped to the grenadier variant, so no other unit is animated by them', () => {
    const css = readFileSync(resolve(ROOT, 'src/assets/sprite-animations-v2.css'), 'utf8');
    const start = css.indexOf('#759: GRENADIER');
    const end = css.indexOf('Pause everything when prefers-reduced-motion');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, end);
    // every selector in the block names the grenadier variant
    for (const selector of block.replace(/\{[^}]*\}/g, '{}').split('{}').map(s => s.trim()).filter(s => s.startsWith('.cq-v2'))) {
      for (const part of selector.split(',').map(p => p.trim())) {
        expect(part, part).toMatch(/data-kind-variant="grenadier"/);
      }
    }
  });

  it('its stylesheet drives a throw, and turns every animation off for reduced motion', () => {
    const css = readFileSync(resolve(ROOT, 'src/assets/sprite-animations-v2.css'), 'utf8');
    expect(css).toMatch(/data-kind-variant="grenadier"\]\[data-state="attack"\] \.cq-arm-r/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*\.cq-v2 \*, \.cq-v2 \.cq-sprite-figure \{ animation: none !important; \}/);
  });

  it('gameplay definitions are untouched: the same units, same roles, same descriptions', () => {
    expect(UNIT_DEFINITIONS.cannon).toMatchObject({ type: 'cannon', name: 'Cannon', movementPoints: 2 });
    expect(UNIT_DEFINITIONS.grenadier).toMatchObject({ type: 'grenadier', name: 'Grenadier', movementPoints: 2 });
  });
});

describe('Cannon painted strip (#1627)', () => {
  it('is a painted PNG strip served by the PNG player, not a native-v2 SVG', () => {
    expect(isPngUnit('cannon')).toBe(true);
    expect(isV2NativeUnit('cannon')).toBe(false);
    const html = getUnitSpriteV2('cannon', 'imperials', '#c0392b')!;
    expect(html).toContain('cq-png');
    expect(html).toContain('data-unit-type="cannon"');
  });

  it('keeps its live SVG sprite as the fallback and rollback', () => {
    expect('cannon' in UNIT_SPRITE_CATALOG).toBe(true);
  });
});
