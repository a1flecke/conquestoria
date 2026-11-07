import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getUnitSpriteV2, isV2NativeUnit } from '@/renderer/sprites/v2/index';
import { isPngUnit } from '@/renderer/sprites/png/png-sprite-catalog';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';

/** #759 batch 2: the Cannon and the Grenadier are original native-v2 sprites (not painted strips). */
const UNITS = ['cannon', 'grenadier'] as const;
const FACTIONS = ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate'];
const ROOT = resolve(__dirname, '../../../..');

/** Class names present in a sprite string, so assertions do not depend on attribute order or whitespace. */
function classes(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  return out;
}

describe('Cannon and Grenadier native-v2 art (#759)', () => {
  it.each(UNITS)('%s is native v2, not a painted strip, and keeps its live SVG fallback', unit => {
    expect(isV2NativeUnit(unit)).toBe(true);
    expect(isPngUnit(unit)).toBe(false);
    expect(unit in UNIT_SPRITE_CATALOG).toBe(true);
  });

  it.each(UNITS)('%s returns complete, well-formed markup for every faction family', unit => {
    for (const faction of FACTIONS) {
      const html = getUnitSpriteV2(unit, faction, '#c0392b')!;
      expect(html, `${unit}/${faction}`).toContain('cq-sprite-wrap cq-v2');
      expect(html).toContain(`data-kind-variant="${unit}"`);
      expect(html).toContain('data-state="idle"');
      expect(html).toContain('width="100%" height="100%"');
      // one SVG, balanced tags, and no HTML nested inside the SVG
      expect(html.match(/<svg\b/g)).toHaveLength(1);
      expect(html.match(/<\/svg>/g)).toHaveLength(1);
      expect(html).not.toMatch(/<svg\b[\s\S]*<div\b/);
      expect(html.match(/<g\b/g)!.length).toBe(html.match(/<\/g>/g)!.length);
    }
  });

  it.each(UNITS)('%s exposes the four damage-tier groups and the shared figure hook', unit => {
    const c = classes(getUnitSpriteV2(unit, 'imperials')!);
    for (const hook of ['cq-sprite-figure', 'cq-shadow', 'cq-wound-1', 'cq-wound-2', 'cq-wound-3']) {
      expect(c.has(hook), `${unit} lacks ${hook}`).toBe(true);
    }
  });

  it('the Cannon has the hooks its roll, recoil and firing animations drive', () => {
    const c = classes(getUnitSpriteV2('cannon', 'imperials')!);
    for (const hook of ['cq-cannon-body', 'cq-cannon-barrel', 'cq-cannon-wheel', 'cq-muzzle-flash', 'cq-cannon-smoke']) {
      expect(c.has(hook), hook).toBe(true);
    }
  });

  it('the Grenadier has articulated legs and arms, a throwing hand and the throw effects', () => {
    const c = classes(getUnitSpriteV2('grenadier', 'imperials')!);
    for (const hook of ['cq-leg-l', 'cq-leg-r', 'cq-arm-l', 'cq-arm-r', 'cq-plume', 'cq-grenade-held', 'cq-grenade-flight', 'cq-grenade-burst']) {
      expect(c.has(hook), hook).toBe(true);
    }
  });

  it('an animated group never also carries an SVG transform attribute (the wrapper rule)', () => {
    for (const unit of UNITS) {
      const html = getUnitSpriteV2(unit, 'imperials')!;
      for (const tag of html.match(/<g\b[^>]*>/g)!) {
        if (/class="[^"]*\bcq-(?:cannon-|grenade-|leg-|arm-|plume|muzzle-flash)/.test(tag)) {
          expect(tag, `${unit}: ${tag}`).not.toMatch(/\btransform=/);
        }
      }
    }
  });

  it('faction colour is preserved: different families produce different markup, minor civs get their own colour', () => {
    for (const unit of UNITS) {
      const imperial = getUnitSpriteV2(unit, 'imperials')!;
      const viking = getUnitSpriteV2(unit, 'vikings')!;
      expect(imperial).not.toBe(viking);
      // an owner that is not an archetype family (a minor civ) still renders, from its own colour
      const minor = getUnitSpriteV2(unit, 'city-state-x', '#7a5a16')!;
      expect(minor).toContain('cq-sprite-wrap');
      expect(minor.toLowerCase()).toContain('#7a5a16');
      // and with no colour at all it falls back to the neutral palette rather than failing
      expect(getUnitSpriteV2(unit, 'barbarian', '')).toContain('cq-sprite-wrap');
    }
  });

  it('the two silhouettes differ substantively (different body plan, parts and variant)', () => {
    const cannon = getUnitSpriteV2('cannon', 'imperials')!;
    const grenadier = getUnitSpriteV2('grenadier', 'imperials')!;
    expect(cannon).not.toBe(grenadier);
    const cannonClasses = classes(cannon);
    const grenadierClasses = classes(grenadier);
    const shared = [...cannonClasses].filter(c => grenadierClasses.has(c));
    const unique = (own: Set<string>) => [...own].filter(c => !shared.includes(c));
    expect(unique(cannonClasses).length).toBeGreaterThanOrEqual(4);
    expect(unique(grenadierClasses).length).toBeGreaterThanOrEqual(6);
    // a wheeled gun has no legs; the infantryman has no wheels
    expect(cannonClasses.has('cq-leg-l')).toBe(false);
    expect(grenadierClasses.has('cq-cannon-wheel')).toBe(false);
  });

  it('their stylesheet rules are scoped to their own variant, so no other unit is animated by them', () => {
    const css = readFileSync(resolve(ROOT, 'src/assets/sprite-animations-v2.css'), 'utf8');
    const start = css.indexOf('#759: CANNON AND GRENADIER');
    const end = css.indexOf('Pause everything when prefers-reduced-motion');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, end);
    // every selector in the block names the cannon or grenadier variant
    for (const selector of block.replace(/\{[^}]*\}/g, '{}').split('{}').map(s => s.trim()).filter(s => s.startsWith('.cq-v2'))) {
      for (const part of selector.split(',').map(p => p.trim())) {
        expect(part, part).toMatch(/data-kind-variant="(?:cannon|grenadier)"/);
      }
    }
  });

  it('their stylesheet drives recoil and a throw, and turns every animation off for reduced motion', () => {
    const css = readFileSync(resolve(ROOT, 'src/assets/sprite-animations-v2.css'), 'utf8');
    expect(css).toMatch(/data-kind-variant="cannon"\]\[data-state="attack"\] \.cq-cannon-barrel/);
    expect(css).toMatch(/data-kind-variant="cannon"\]\[data-state="walk"\] \.cq-cannon-wheel/);
    expect(css).toMatch(/data-kind-variant="grenadier"\]\[data-state="attack"\] \.cq-arm-r/);
    // one-shot effects stay hidden unless their state shows them (so reduced motion shows a still pose)
    expect(css).toMatch(/data-kind-variant="cannon"\] \.cq-cannon-smoke \{ opacity: 0; \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*\.cq-v2 \*, \.cq-v2 \.cq-sprite-figure \{ animation: none !important; \}/);
  });

  it('gameplay definitions are untouched: the same units, same roles, same descriptions', () => {
    expect(UNIT_DEFINITIONS.cannon).toMatchObject({ type: 'cannon', name: 'Cannon', movementPoints: 2 });
    expect(UNIT_DEFINITIONS.grenadier).toMatchObject({ type: 'grenadier', name: 'Grenadier', movementPoints: 2 });
  });
});
