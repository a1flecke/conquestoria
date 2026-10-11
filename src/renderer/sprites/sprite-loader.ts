import { notifyCanvasAssetReady } from '../canvas-asset-ready';
import { derivePalette } from './sprite-system';
import {
  UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG,
  PIRATE_HEADQUARTERS_SPRITE_CATALOG,
  UNIT_SPRITE_SIZE, BUILDING_SPRITE_SIZE, LANDMARK_SPRITE_SIZE,
} from './sprite-catalog';
import { getPngUnitManifest } from './png/png-sprite-catalog';
import { bakePngUnitImage } from './png/png-sprite-canvas';
import type { UnitType } from '@/core/types';
import type { FactionPalette } from './sprite-system';
import type { UnitSpriteMotion } from './units';
import { PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';

const PIRATE_OWNER_FAMILY = 'pirates';
const PIRATE_PALETTE: FactionPalette = { dark: '#351923', mid: '#8b2635', bright: '#d6a14a', trim: '#e7dcc5' };
const PIRATE_HULL_SET = new Set<string>(PIRATE_HULL_TYPES);

const UNIT_MOTIONS: UnitSpriteMotion[] = ['idle', 'move-a', 'move-b'];

export const SPRITE_DIAGNOSTIC_METADATA = Symbol.for('conquestoria.spriteDiagnostic');

export interface SpriteDiagnosticMetadata {
  kind: 'unit' | 'building' | 'landmark';
  itemId: string;
  civilization: string;
  motion?: UnitSpriteMotion;
}

type DiagnosticImage = HTMLImageElement & {
  [SPRITE_DIAGNOSTIC_METADATA]?: SpriteDiagnosticMetadata;
};

function attachSpriteDiagnosticMetadata(
  image: HTMLImageElement,
  metadata: SpriteDiagnosticMetadata,
): HTMLImageElement {
  Object.defineProperty(image as DiagnosticImage, SPRITE_DIAGNOSTIC_METADATA, {
    value: Object.freeze({ ...metadata }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return image;
}

export function getSpriteDiagnosticMetadata(image: HTMLImageElement): SpriteDiagnosticMetadata | undefined {
  return (image as DiagnosticImage)[SPRITE_DIAGNOSTIC_METADATA];
}

function svgStringToImage(
  svgString: string,
  size: number,
  metadata: SpriteDiagnosticMetadata,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = attachSpriteDiagnosticMetadata(new Image(size, size), metadata);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG image load failed')); };
    img.src = url;
  });
}

/**
 * Sprite loads are scheduled, not fired all at once (#1439 phase 4). A civilization is ~500 SVG images
 * (every unit x 3 motions, every building) and the pirates ~60 more; creating them in one burst keeps
 * the browser's main thread busy for seconds (SVG parse/decode is native main-thread work), which
 * delays the first interaction long after the first paint. The queue keeps the same set of images but
 *   - bounds how many are in flight, so input events interleave with decode work,
 *   - generates each SVG string only when its turn comes, and
 *   - loads what is visible first: idle unit frames and buildings, then pirates, then walk frames.
 */
export const SPRITE_LOAD_CONCURRENCY = 8;

/** Lower runs first. */
export const SPRITE_PRIORITY = { visible: 0, pirate: 1, motion: 2 } as const;

interface QueuedLoad {
  priority: number;
  work: () => Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

class SpriteLoadQueue {
  private pending: QueuedLoad[] = [];
  private inFlight = 0;
  private pumpQueued = false;

  schedule(priority: number, work: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let index = this.pending.length;
      while (index > 0 && this.pending[index - 1]!.priority > priority) index -= 1;
      this.pending.splice(index, 0, { priority, work, resolve, reject });
      // Start work on a microtask, not here: a synchronous burst (pirates, then every civilization)
      // must be fully queued and sorted before the first task is chosen, or the first few entries
      // would run ahead of higher-priority ones that are scheduled a moment later.
      if (!this.pumpQueued) {
        this.pumpQueued = true;
        queueMicrotask(() => {
          this.pumpQueued = false;
          this.pump();
        });
      }
    });
  }

  private pump(): void {
    while (this.inFlight < SPRITE_LOAD_CONCURRENCY && this.pending.length > 0) {
      const next = this.pending.shift()!;
      this.inFlight += 1;
      Promise.resolve()
        .then(next.work)
        .then(next.resolve, next.reject)
        .finally(() => {
          this.inFlight -= 1;
          this.pump();
        });
    }
  }
}

const spriteLoadQueue = new SpriteLoadQueue();

class SpriteCache {
  private units = new Map<string, HTMLImageElement>();
  private buildings = new Map<string, HTMLImageElement>();
  private landmarks = new Map<string, HTMLImageElement>();
  private civLoads = new Map<string, Promise<void>>();
  private pirateLoad: Promise<void> | null = null;

  async loadCiv(civId: string, civColor: string): Promise<void> {
    const palette: FactionPalette = derivePalette(civColor);

    const visibleWork: Array<Promise<void>> = [];
    const motionWork: Array<Promise<void>> = [];

    for (const [type, fn] of Object.entries(UNIT_SPRITE_CATALOG)) {
      if (PIRATE_HULL_SET.has(type)) continue;
      for (const motion of UNIT_MOTIONS) {
        const metadata: SpriteDiagnosticMetadata = { kind: 'unit', itemId: type, civilization: civId, motion };
        const priority = motion === 'idle' ? SPRITE_PRIORITY.visible : SPRITE_PRIORITY.motion;
        const load = spriteLoadQueue.schedule(priority, async () => {
          // PNG spritesheet units bake their tinted frame; any failure (no canvas, sheet missing) keeps the SVG sprite.
          const pngManifest = getPngUnitManifest(type);
          let img: HTMLImageElement | null = null;
          if (pngManifest) {
            img = await bakePngUnitImage(pngManifest, civColor, motion)
              .then(baked => attachSpriteDiagnosticMetadata(baked, metadata))
              .catch(() => null);
          }
          if (!img) {
            const svg = fn({ palette, svgOnly: true, motion });
            if (!svg) return;
            img = await svgStringToImage(svg, UNIT_SPRITE_SIZE, metadata);
          }
          this.units.set(`${type}:${civId}:${motion}`, img);
          if (motion === 'idle') {
            this.units.set(`${type}:${civId}`, img);
          }
        });
        (motion === 'idle' ? visibleWork : motionWork).push(load);
      }
    }

    for (const [id, fn] of Object.entries(BUILDING_SPRITE_CATALOG)) {
      visibleWork.push(spriteLoadQueue.schedule(SPRITE_PRIORITY.visible, async () => {
        const svg = fn({ palette, svgOnly: true });
        if (!svg) return;
        const img = await svgStringToImage(svg, BUILDING_SPRITE_SIZE, {
          kind: 'building', itemId: id, civilization: civId,
        });
        this.buildings.set(`${id}:${civId}`, img);
      }));
    }

    // What is drawn at rest is announced as soon as it is ready, without waiting for walk frames.
    Promise.all(visibleWork).then(() => notifyCanvasAssetReady(), () => undefined);

    // Partial sets are visible to the cache even when one image rejects, so announce on failure too.
    try {
      await Promise.all([...visibleWork, ...motionWork]);
    } finally {
      notifyCanvasAssetReady();
    }
  }

  async loadPirates(): Promise<void> {
    const unitWork = PIRATE_HULL_TYPES.flatMap(type => UNIT_MOTIONS.map(motion => spriteLoadQueue.schedule(
      motion === 'idle' ? SPRITE_PRIORITY.pirate : SPRITE_PRIORITY.motion,
      async () => {
        const svg = UNIT_SPRITE_CATALOG[type]({ palette: PIRATE_PALETTE, svgOnly: true, motion });
        const img = await svgStringToImage(svg, UNIT_SPRITE_SIZE, {
          kind: 'unit', itemId: type, civilization: PIRATE_OWNER_FAMILY, motion,
        });
        this.units.set(`${type}:${PIRATE_OWNER_FAMILY}:${motion}`, img);
        if (motion === 'idle') this.units.set(`${type}:${PIRATE_OWNER_FAMILY}`, img);
      },
    )));
    const landmarkWork = Object.entries(PIRATE_HEADQUARTERS_SPRITE_CATALOG).map(([id, render]) =>
      spriteLoadQueue.schedule(SPRITE_PRIORITY.pirate, async () => {
        const img = await svgStringToImage(render({ svgOnly: true }), LANDMARK_SPRITE_SIZE, {
          kind: 'landmark', itemId: id, civilization: PIRATE_OWNER_FAMILY,
        });
        this.landmarks.set(id, img);
      }));
    try {
      await Promise.all([...unitWork, ...landmarkWork]);
    } finally {
      notifyCanvasAssetReady();
    }
  }

  ensurePirates(): void {
    if (this.units.has(`pirate_galley:${PIRATE_OWNER_FAMILY}`) || this.pirateLoad) return;
    this.pirateLoad = this.loadPirates().catch(() => undefined).finally(() => { this.pirateLoad = null; });
  }

  getUnit(type: UnitType, civId: string): HTMLImageElement | null {
    return this.units.get(`${type}:${civId}`) ?? null;
  }

  getUnitMotion(type: UnitType, civId: string, motion: UnitSpriteMotion): HTMLImageElement | null {
    return this.units.get(`${type}:${civId}:${motion}`) ?? null;
  }

  ensureCiv(civId: string, civColor: string): void {
    if (civId === PIRATE_OWNER_FAMILY) {
      this.ensurePirates();
      return;
    }
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

  getLandmark(landmarkId: string): HTMLImageElement | null {
    return this.landmarks.get(landmarkId) ?? null;
  }
}

export const spriteCache = new SpriteCache();

export async function initSprites(civColors: Record<string, string>): Promise<void> {
  await Promise.all([
    spriteCache.loadPirates(),
    ...Object.entries(civColors).map(([civId, color]) => spriteCache.loadCiv(civId, color)),
  ]);
}
