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

/**
 * One sprite the game wants: a unit type or a building id for one civilization (or neutral owner).
 * The cache resolves which catalog the id belongs to, so a production queue head needs no
 * unit-versus-building decision from the caller.
 */
export interface SpriteDemandItem {
  readonly id: string;
  readonly civId: string;
}

/**
 * The sprites a freshly presented game state will draw (#1439 phase 5): one entry per distinct
 * (unit type, owner) among the major civilizations' units, and one per distinct production-queue head
 * (the city production badge draws the head's sprite). Everything else the game later shows (a unit
 * trained next turn, a neutral owner's unit) is requested by its first cache miss.
 *
 * Only owners that have a palette in `state.civilizations` are listed: neutral owners (barbarians,
 * minor civs) get their colour from the unit renderer's own miss path, and pirates load as one set.
 * Pure and viewer-independent: it decides what to *prepare*, never what is shown, so it reveals nothing.
 * Typed structurally, so a `GameState` satisfies it without this module importing the state types.
 */
export function collectSpriteDemand(state: {
  readonly civilizations: Readonly<Record<string, unknown>>;
  readonly units: Readonly<Record<string, { readonly type: string; readonly owner: string }>>;
  readonly cities: Readonly<Record<string, { readonly owner: string; readonly productionQueue: readonly string[] }>>;
}): SpriteDemandItem[] {
  const seen = new Set<string>();
  const demand: SpriteDemandItem[] = [];
  const add = (id: string, civId: string): void => {
    const key = `${id}:${civId}`;
    if (seen.has(key)) return;
    seen.add(key);
    demand.push({ id, civId });
  };

  for (const unit of Object.values(state.units)) {
    if (state.civilizations[unit.owner]) add(unit.type, unit.owner);
  }
  for (const city of Object.values(state.cities)) {
    const head = city.productionQueue[0];
    if (head && state.civilizations[city.owner]) add(head, city.owner);
  }
  return demand;
}

/**
 * Sprites are created on demand (#1439 phase 5). The cache used to build every unit x 3 motions and
 * every building SVG for every civilization up front (~500 images per civ: ~0.8 GB of renderer memory
 * for two civs, ~1.2 GB for five), although a game only draws the unit types that exist in it and the
 * building on a city's production badge. Now an (id, civ) pair is created when it is first asked for:
 * `initSprites` seeds what the starting state needs, and a cache miss in `getUnit`/`getUnitMotion`/
 * `getBuilding` requests the missing pair (the caller falls back to its glyph until the canvas is told
 * the image is ready, exactly as for any late load).
 */
class SpriteCache {
  private units = new Map<string, HTMLImageElement>();
  private buildings = new Map<string, HTMLImageElement>();
  private landmarks = new Map<string, HTMLImageElement>();
  private civColors = new Map<string, string>();
  /** Every (id, civ) pair ever requested, including ones with no art or a failed load: never retried per frame. */
  private requested = new Set<string>();
  private pirateLoad: Promise<void> | null = null;

  registerCiv(civId: string, civColor: string): void {
    this.civColors.set(civId, civColor);
  }

  /**
   * Creates the sprites for `id` (every motion for a unit type, the building image for a building id)
   * for `civId`. Resolves when they are cached; rejects if an image fails. Requesting the same pair
   * again returns immediately, so repeated per-frame misses cost one Set lookup.
   */
  request(id: string, civId: string): Promise<void> {
    const key = `${id}:${civId}`;
    const civColor = this.civColors.get(civId);
    if (civColor === undefined || this.requested.has(key)) return Promise.resolve();
    this.requested.add(key);

    const palette: FactionPalette = derivePalette(civColor);
    const visibleWork: Array<Promise<void>> = [];
    const motionWork: Array<Promise<void>> = [];

    const unitSprite = UNIT_SPRITE_CATALOG[id as UnitType];
    if (unitSprite && !PIRATE_HULL_SET.has(id)) {
      for (const motion of UNIT_MOTIONS) {
        const metadata: SpriteDiagnosticMetadata = { kind: 'unit', itemId: id, civilization: civId, motion };
        const priority = motion === 'idle' ? SPRITE_PRIORITY.visible : SPRITE_PRIORITY.motion;
        const load = spriteLoadQueue.schedule(priority, async () => {
          // PNG spritesheet units bake their tinted frame; any failure (no canvas, sheet missing) keeps the SVG sprite.
          const pngManifest = getPngUnitManifest(id);
          let img: HTMLImageElement | null = null;
          if (pngManifest) {
            img = await bakePngUnitImage(pngManifest, civColor, motion)
              .then(baked => attachSpriteDiagnosticMetadata(baked, metadata))
              .catch(() => null);
          }
          if (!img) {
            const svg = unitSprite({ palette, svgOnly: true, motion });
            if (!svg) return;
            img = await svgStringToImage(svg, UNIT_SPRITE_SIZE, metadata);
          }
          this.units.set(`${id}:${civId}:${motion}`, img);
          if (motion === 'idle') this.units.set(`${id}:${civId}`, img);
        });
        (motion === 'idle' ? visibleWork : motionWork).push(load);
      }
    }

    const buildingSprite = BUILDING_SPRITE_CATALOG[id];
    if (buildingSprite) {
      visibleWork.push(spriteLoadQueue.schedule(SPRITE_PRIORITY.visible, async () => {
        const svg = buildingSprite({ palette, svgOnly: true });
        if (!svg) return;
        const img = await svgStringToImage(svg, BUILDING_SPRITE_SIZE, {
          kind: 'building', itemId: id, civilization: civId,
        });
        this.buildings.set(`${id}:${civId}`, img);
      }));
    }

    if (visibleWork.length === 0 && motionWork.length === 0) return Promise.resolve();

    // What is drawn at rest is announced as soon as it is ready, without waiting for walk frames.
    Promise.all(visibleWork).then(() => notifyCanvasAssetReady(), () => undefined);
    return Promise.all([...visibleWork, ...motionWork]).then(() => undefined).finally(() => {
      // Partial sets are visible to the cache even when one image rejects, so announce on failure too.
      notifyCanvasAssetReady();
    });
  }

  /** Fire-and-forget request from a cache miss: the renderer falls back until the canvas is notified. */
  private requestInBackground(id: string, civId: string): void {
    void this.request(id, civId).catch(() => undefined);
  }

  /** Registers the civilization's palette and requests one unit's sprites (the unit renderer's miss path). */
  ensureUnit(type: UnitType, civId: string, civColor: string): void {
    if (civId === PIRATE_OWNER_FAMILY) {
      this.ensurePirates();
      return;
    }
    this.registerCiv(civId, civColor);
    this.requestInBackground(type, civId);
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
    const image = this.units.get(`${type}:${civId}`);
    if (image) return image;
    this.requestInBackground(type, civId);
    return null;
  }

  getUnitMotion(type: UnitType, civId: string, motion: UnitSpriteMotion): HTMLImageElement | null {
    const image = this.units.get(`${type}:${civId}:${motion}`);
    if (image) return image;
    this.requestInBackground(type, civId);
    return null;
  }

  getBuilding(buildingId: string, civId: string): HTMLImageElement | null {
    const image = this.buildings.get(`${buildingId}:${civId}`);
    if (image) return image;
    this.requestInBackground(buildingId, civId);
    return null;
  }

  getLandmark(landmarkId: string): HTMLImageElement | null {
    return this.landmarks.get(landmarkId) ?? null;
  }
}

export const spriteCache = new SpriteCache();

/**
 * Registers every civilization's palette, loads the pirate set, and creates the sprites in `demand`
 * (what the starting state needs). Resolves when those are cached. Anything else the game later draws
 * is created on its first cache miss.
 */
export async function initSprites(
  civColors: Record<string, string>,
  demand: ReadonlyArray<SpriteDemandItem>,
): Promise<void> {
  for (const [civId, color] of Object.entries(civColors)) spriteCache.registerCiv(civId, color);
  await Promise.all([
    spriteCache.loadPirates(),
    ...demand.map(item => spriteCache.request(item.id, item.civId)),
  ]);
}
