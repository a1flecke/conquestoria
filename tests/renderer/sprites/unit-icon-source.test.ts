import { describe, expect, it } from 'vitest';
import { getUnitIconSource } from '@/renderer/sprites/unit-icon-source';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { getPngUnitManifest, listPngUnitManifests } from '@/renderer/sprites/png/png-sprite-catalog';
import { derivePalette, NEUTRAL_FACTION_PALETTE } from '@/renderer/sprites/sprite-system';
import { NEUTRAL_PNG_TINT } from '@/renderer/sprites/faction-accent-colors';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';

// #1535: the city panel shows a unit's real sprite. The source comes from the canonical catalogs (the SVG catalog, and the PNG
// manifest table for the migrated units), never from a list kept beside them.

describe('getUnitIconSource', () => {
  it('gives every trainable unit a source from the canonical catalogs, PNG exactly when it has a manifest', () => {
    for (const unit of TRAINABLE_UNITS) {
      const source = getUnitIconSource(unit.type, '#c0392b');
      expect(source, `${unit.type} has no icon source`).not.toBeNull();
      expect(source!.kind, unit.type).toBe(getPngUnitManifest(unit.type) ? 'png' : 'svg');
    }
  });

  it('covers every migrated PNG unit (so a new manifest row needs no UI edit)', () => {
    for (const manifest of listPngUnitManifests()) {
      expect(getUnitIconSource(manifest.id, '#c0392b')?.kind, manifest.id).toBe('png');
    }
  });

  it('draws an SVG unit with the owner palette and nothing hard-coded', () => {
    const svgUnit = TRAINABLE_UNITS.find(unit => !getPngUnitManifest(unit.type))!.type;
    const red = getUnitIconSource(svgUnit, '#c0392b');
    const blue = getUnitIconSource(svgUnit, '#2980b9');
    expect(red?.kind).toBe('svg');
    expect(blue?.kind).toBe('svg');
    const redSvg = (red as { svg: string }).svg;
    const blueSvg = (blue as { svg: string }).svg;
    expect(redSvg).toContain('<svg');
    expect(redSvg).toContain(derivePalette('#c0392b').mid);
    expect(blueSvg).toContain(derivePalette('#2980b9').mid);
    expect(redSvg).not.toBe(blueSvg);
  });

  it('tints a PNG unit with the owner colour, and only that colour varies', () => {
    const pngUnit = listPngUnitManifests()[0]!.id;
    const red = getUnitIconSource(pngUnit, '#c0392b') as { kind: 'png'; html: string };
    const blue = getUnitIconSource(pngUnit, '#2980b9') as { kind: 'png'; html: string };
    expect(red.html).toContain('--cq-tint:#c0392b');
    expect(blue.html).toContain('--cq-tint:#2980b9');
    expect(red.html.replace('#c0392b', '#')).toBe(blue.html.replace('#2980b9', '#'));
  });

  it('falls back to the neutral palette and tint when the owner has no colour', () => {
    const pngUnit = listPngUnitManifests()[0]!.id;
    expect((getUnitIconSource(pngUnit, null) as { html: string }).html).toContain(`--cq-tint:${NEUTRAL_PNG_TINT}`);
    const svgUnit = TRAINABLE_UNITS.find(unit => !getPngUnitManifest(unit.type))!.type;
    expect((getUnitIconSource(svgUnit, null) as { svg: string }).svg).toContain(NEUTRAL_FACTION_PALETTE.mid);
  });

  it('never throws and returns null for an id that is not a unit', () => {
    for (const id of ['granary', 'legendary:oracle', '', '__proto__', 'constructor', 'toString']) {
      expect(() => getUnitIconSource(id, '#c0392b'), id).not.toThrow();
      expect(getUnitIconSource(id, '#c0392b'), id).toBeNull();
    }
  });

  it('refuses a free-form owner colour in a PNG style attribute', () => {
    const pngUnit = listPngUnitManifests()[0]!.id;
    const html = (getUnitIconSource(pngUnit, 'red;background:url(x)') as { html: string }).html;
    expect(html).not.toContain('background:url(x)');
    expect(html).toContain(`--cq-tint:${NEUTRAL_PNG_TINT}`);
  });

  it('keeps the unit and building id spaces apart, so a production item id is unambiguous', () => {
    const unitIds = new Set(Object.keys(UNIT_SPRITE_CATALOG));
    for (const unit of TRAINABLE_UNITS) expect(unitIds.has(unit.type), `${unit.type} is not in the unit catalog`).toBe(true);
    for (const buildingId of Object.keys(BUILDINGS)) expect(unitIds.has(buildingId), `${buildingId} is both a building and a unit`).toBe(false);
  });
});
