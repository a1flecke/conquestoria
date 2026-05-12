import { derivePalette } from './sprite-system';
import {
  UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG,
  UNIT_SPRITE_SIZE, BUILDING_SPRITE_SIZE,
} from './sprite-catalog';
import type { UnitType } from '@/core/types';
import type { FactionPalette } from './sprite-system';

function svgStringToImage(svgString: string, size: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image(size, size);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG image load failed')); };
    img.src = url;
  });
}

class SpriteCache {
  private units = new Map<string, HTMLImageElement>();
  private buildings = new Map<string, HTMLImageElement>();

  async loadCiv(civId: string, civColor: string): Promise<void> {
    const palette: FactionPalette = derivePalette(civColor);

    const unitWork = Object.entries(UNIT_SPRITE_CATALOG).map(async ([type, fn]) => {
      const svg = fn({ palette, svgOnly: true });
      if (!svg) return;
      const img = await svgStringToImage(svg, UNIT_SPRITE_SIZE);
      this.units.set(`${type}:${civId}`, img);
    });

    const buildingWork = Object.entries(BUILDING_SPRITE_CATALOG).map(async ([id, fn]) => {
      const svg = fn({ palette, svgOnly: true });
      if (!svg) return;
      const img = await svgStringToImage(svg, BUILDING_SPRITE_SIZE);
      this.buildings.set(`${id}:${civId}`, img);
    });

    await Promise.all([...unitWork, ...buildingWork]);
  }

  getUnit(type: UnitType, civId: string): HTMLImageElement | null {
    return this.units.get(`${type}:${civId}`) ?? null;
  }

  getBuilding(buildingId: string, civId: string): HTMLImageElement | null {
    return this.buildings.get(`${buildingId}:${civId}`) ?? null;
  }
}

export const spriteCache = new SpriteCache();

export async function initSprites(civColors: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(civColors).map(([civId, color]) => spriteCache.loadCiv(civId, color)),
  );
}
