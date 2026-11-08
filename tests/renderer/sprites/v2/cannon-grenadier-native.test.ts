import { describe, it, expect } from 'vitest';
import { getUnitSpriteV2, isV2NativeUnit } from '@/renderer/sprites/v2/index';
import { isPngUnit } from '@/renderer/sprites/png/png-sprite-catalog';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';

/**
 * #759 batch 2 gave the Cannon and the Grenadier original native-v2 art. Both are painted strips now (#1627), so a strip
 * takes precedence over that art and it was dropped rather than left unreachable. Each unit keeps only its live SVG
 * fallback, which is also its rollback. (The file name is kept so the CI shard map is unchanged.)
 */
describe.each(['cannon', 'grenadier'])('%s painted strip (#1627)', (type) => {
  it('is a painted PNG strip served by the PNG player, not a native-v2 SVG', () => {
    expect(isPngUnit(type)).toBe(true);
    expect(isV2NativeUnit(type)).toBe(false);
    const html = getUnitSpriteV2(type, 'imperials', '#c0392b')!;
    expect(html).toContain('cq-png');
    expect(html).toContain(`data-unit-type="${type}"`);
  });

  it('keeps its live SVG sprite as the fallback and rollback', () => {
    expect(type in UNIT_SPRITE_CATALOG).toBe(true);
  });
});

describe('gameplay definitions are untouched by the art change', () => {
  it('keeps the same units, names and movement', () => {
    expect(UNIT_DEFINITIONS.cannon).toMatchObject({ type: 'cannon', name: 'Cannon', movementPoints: 2 });
    expect(UNIT_DEFINITIONS.grenadier).toMatchObject({ type: 'grenadier', name: 'Grenadier', movementPoints: 2 });
  });
});
