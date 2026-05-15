import { derivePalette } from './sprite-system';
import {
  UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG,
  UNIT_SPRITE_SIZE, BUILDING_SPRITE_SIZE,
} from './sprite-catalog';
import type { UnitType } from '@/core/types';
import type { FactionPalette } from './sprite-system';
import type { UnitSpriteMotion } from './units';

const UNIT_MOTIONS: UnitSpriteMotion[] = ['idle', 'move-a', 'move-b'];

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
  private civLoads = new Map<string, Promise<void>>();

  async loadCiv(civId: string, civColor: string): Promise<void> {
    const palette: FactionPalette = derivePalette(civColor);

    const unitWork = Object.entries(UNIT_SPRITE_CATALOG).flatMap(([type, fn]) =>
      UNIT_MOTIONS.map(async (motion) => {
        const svg = fn({ palette, svgOnly: true, motion });
        if (!svg) return;
        const img = await svgStringToImage(svg, UNIT_SPRITE_SIZE);
        this.units.set(`${type}:${civId}:${motion}`, img);
        if (motion === 'idle') {
          this.units.set(`${type}:${civId}`, img);
        }
      }),
    );

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

  getUnitMotion(type: UnitType, civId: string, motion: UnitSpriteMotion): HTMLImageElement | null {
    return this.units.get(`${type}:${civId}:${motion}`) ?? null;
  }

  ensureCiv(civId: string, civColor: string): void {
    if (this.units.has(`warrior:${civId}`) || this.civLoads.has(civId)) return;
    const load = this.loadCiv(civId, civColor)
      .catch(() => undefined)
      .finally(() => {
        this.civLoads.delete(civId);
      });
    this.civLoads.set(civId, load);
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
