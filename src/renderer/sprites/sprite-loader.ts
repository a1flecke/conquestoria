import { notifyCanvasAssetReady } from '../canvas-asset-ready';
import { derivePalette } from './sprite-system';
import {
  UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG,
  PIRATE_HEADQUARTERS_SPRITE_CATALOG,
  UNIT_SPRITE_SIZE, BUILDING_SPRITE_SIZE, LANDMARK_SPRITE_SIZE,
} from './sprite-catalog';
import { BUILDING_ART } from '../buildings/building-art-catalog';
import { buildBuildingArtSvg } from '../buildings/building-art-sprite';
import { loadBuildingArtDataUri } from '../buildings/building-art-data-uri';
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
 * Everything the cache holds for one civilization id in one palette. The bucket *is* the generation
 * token: a colour change replaces it, so an image whose load finishes after that sees that the bucket it
 * was built for is no longer the current one and is dropped instead of committed. Its keys therefore need
 * no colour or campaign component, and releasing a civilization is deleting one map entry.
 */
interface CivSprites {
  readonly color: string;
  /** `${id}:${motion}` per motion, plus `${id}` for the idle frame. */
  readonly units: Map<string, HTMLImageElement>;
  readonly buildings: Map<string, HTMLImageElement>;
  /** Every id requested in this palette, including ones with no art or a failed load: never retried per frame. */
  readonly requested: Set<string>;
  /** Requested ids whose load rejected; the next campaign start (an explicit boundary) lets them retry once. */
  readonly failed: Set<string>;
}

function createCivSprites(color: string): CivSprites {
  return { color, units: new Map(), buildings: new Map(), requested: new Set(), failed: new Set() };
}

export interface SpriteCacheStats {
  readonly civilizations: number;
  readonly unitImages: number;
  readonly buildingImages: number;
  readonly landmarkImages: number;
}

/**
 * Sprites are created on demand (#1439 phase 5). The cache used to build every unit x 3 motions and
 * every building SVG for every civilization up front (~500 images per civ: ~0.8 GB of renderer memory
 * for two civs, ~1.2 GB for five), although a game only draws the unit types that exist in it and the
 * building on a city's production badge. Now an (id, civ) pair is created when it is first asked for:
 * `initSprites` seeds what the starting state needs, and a cache miss in `getUnit`/`getUnitMotion`/
 * `getBuilding` requests the missing pair (the caller falls back to its glyph until the canvas is told
 * the image is ready, exactly as for any late load).
 *
 * The cache outlives a campaign (new game, loaded save and hot-seat re-entry all run `startGame`, and a
 * new game reuses `player` as a civ id with a new colour), so its lifecycle is explicit:
 *  - an image belongs to the palette it was built for (`CivSprites`); a different colour for the same id
 *    starts a fresh bucket and never serves the old art;
 *  - a load that completes for a replaced or released bucket is discarded, never committed or announced;
 *  - unchanged demand (same id, same colour) is idempotent, including the pirate set;
 *  - a different campaign releases the civilizations it no longer has;
 *  - a failed load is retried only at the next `initSprites`, never by a frame.
 */
class SpriteCache {
  private civs = new Map<string, CivSprites>();
  private pirateUnits = new Map<string, HTMLImageElement>();
  private landmarks = new Map<string, HTMLImageElement>();
  private campaignSignature: string | null = null;
  private pirateLoad: Promise<void> | null = null;
  private piratesLoaded = false;
  private pirateFailed = false;

  /** Records the palette for `civId`. A different colour replaces everything built for the old one. */
  registerCiv(civId: string, civColor: string): void {
    if (this.civs.get(civId)?.color === civColor) return;
    this.civs.set(civId, createCivSprites(civColor));
  }

  /**
   * A campaign starts presenting (`startGame`): registers its palettes, releases civilizations a
   * different campaign had, and re-opens failed loads for one retry. Re-entering the same campaign
   * (same civilizations and colours: a loaded save, a hot-seat turn) releases nothing.
   */
  beginCampaign(civColors: Readonly<Record<string, string>>): void {
    const signature = Object.entries(civColors)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([civId, color]) => `${civId}:${color}`)
      .join('|');
    const sameCampaign = signature === this.campaignSignature;
    this.campaignSignature = signature;

    for (const [civId, color] of Object.entries(civColors)) this.registerCiv(civId, color);
    if (!sameCampaign) {
      // Neutral owners (barbarians, minor civs) are dropped too; they come back through their first miss.
      for (const civId of [...this.civs.keys()]) {
        if (!Object.hasOwn(civColors, civId)) this.civs.delete(civId);
      }
    }
    for (const bucket of this.civs.values()) {
      for (const id of bucket.failed) bucket.requested.delete(id);
      bucket.failed.clear();
    }
    this.pirateFailed = false;
  }

  /**
   * Creates the sprites for `id` (every motion for a unit type, the building image for a building id)
   * for `civId`. Resolves when they are cached; rejects if an image fails. Requesting the same pair
   * again returns immediately, so repeated per-frame misses cost one Set lookup.
   */
  request(id: string, civId: string): Promise<void> {
    const bucket = this.civs.get(civId);
    if (bucket === undefined || bucket.requested.has(id)) return Promise.resolve();
    bucket.requested.add(id);

    const civColor = bucket.color;
    const isCurrent = (): boolean => this.civs.get(civId) === bucket;
    const palette: FactionPalette = derivePalette(civColor);
    const visibleWork: Array<Promise<void>> = [];
    const motionWork: Array<Promise<void>> = [];

    const unitSprite = UNIT_SPRITE_CATALOG[id as UnitType];
    if (unitSprite && !PIRATE_HULL_SET.has(id)) {
      for (const motion of UNIT_MOTIONS) {
        if (bucket.units.has(`${id}:${motion}`)) continue; // kept from an earlier, partly failed attempt
        const metadata: SpriteDiagnosticMetadata = { kind: 'unit', itemId: id, civilization: civId, motion };
        const priority = motion === 'idle' ? SPRITE_PRIORITY.visible : SPRITE_PRIORITY.motion;
        const load = spriteLoadQueue.schedule(priority, async () => {
          if (!isCurrent()) return; // the campaign moved on while this was queued: do not even decode
          // PNG spritesheet units bake their tinted frame; any failure (no canvas, sheet missing) keeps the SVG sprite.
          const pngManifest = getPngUnitManifest(id);
          let img: HTMLImageElement | null = null;
          if (pngManifest) {
            img = await bakePngUnitImage(pngManifest, civColor, motion)
              .then(baked => attachSpriteDiagnosticMetadata(baked, metadata))
              .catch(() => null);
          }
          if (!img) {
            if (!isCurrent()) return;
            const svg = unitSprite({ palette, svgOnly: true, motion });
            if (!svg) return;
            img = await svgStringToImage(svg, UNIT_SPRITE_SIZE, metadata);
          }
          if (!isCurrent()) return; // built for a palette that is no longer the cache's: drop it
          bucket.units.set(`${id}:${motion}`, img);
          if (motion === 'idle') bucket.units.set(id, img);
        });
        (motion === 'idle' ? visibleWork : motionWork).push(load);
      }
    }

    const buildingSprite = BUILDING_SPRITE_CATALOG[id];
    if (buildingSprite && !bucket.buildings.has(id)) {
      visibleWork.push(spriteLoadQueue.schedule(SPRITE_PRIORITY.visible, async () => {
        if (!isCurrent()) return;
        const metadata: SpriteDiagnosticMetadata = { kind: 'building', itemId: id, civilization: civId };
        // #620: a building with production art is the art plus this owner's banner; a missing or failed file falls back to
        // the SVG component below, which every such building keeps.
        let img: HTMLImageElement | null = null;
        if (BUILDING_ART[id]) {
          img = await loadBuildingArtDataUri(id)
            .then(href => buildBuildingArtSvg(id, palette, href))
            .then(artSvg => (artSvg ? svgStringToImage(artSvg, BUILDING_SPRITE_SIZE, metadata) : null))
            .catch(() => null);
        }
        if (!img) {
          if (!isCurrent()) return;
          const svg = buildingSprite({ palette, svgOnly: true });
          if (!svg) return;
          img = await svgStringToImage(svg, BUILDING_SPRITE_SIZE, metadata);
        }
        if (!isCurrent()) return;
        bucket.buildings.set(id, img);
      }));
    }

    if (visibleWork.length === 0 && motionWork.length === 0) return Promise.resolve();

    // What is drawn at rest is announced as soon as it is ready, without waiting for walk frames.
    // A superseded request announces nothing: the canvas has nothing new to pick up from it.
    Promise.all(visibleWork).then(() => { if (isCurrent()) notifyCanvasAssetReady(); }, () => undefined);
    return Promise.all([...visibleWork, ...motionWork])
      .then(() => undefined, (error: unknown) => {
        bucket.failed.add(id);
        throw error;
      })
      .finally(() => {
        // Partial sets are visible to the cache even when one image rejects, so announce on failure too.
        if (isCurrent()) notifyCanvasAssetReady();
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

  /**
   * Loads the pirate set once. Idempotent: complete, it resolves immediately; in flight, callers join
   * the same load; after a failure the next explicit call (a campaign start) retries only what is missing.
   */
  loadPirates(): Promise<void> {
    if (this.piratesLoaded) return Promise.resolve();
    if (this.pirateLoad) return this.pirateLoad;
    const load: Promise<void> = this.runPirateLoad()
      .then(() => { this.piratesLoaded = true; }, (error: unknown) => {
        this.pirateFailed = true;
        throw error;
      })
      .finally(() => {
        if (this.pirateLoad === load) this.pirateLoad = null;
      });
    this.pirateLoad = load;
    return load;
  }

  private async runPirateLoad(): Promise<void> {
    const unitWork = PIRATE_HULL_TYPES.flatMap(type => UNIT_MOTIONS.map(motion => spriteLoadQueue.schedule(
      motion === 'idle' ? SPRITE_PRIORITY.pirate : SPRITE_PRIORITY.motion,
      async () => {
        if (this.pirateUnits.has(`${type}:${motion}`)) return;
        const svg = UNIT_SPRITE_CATALOG[type]({ palette: PIRATE_PALETTE, svgOnly: true, motion });
        const img = await svgStringToImage(svg, UNIT_SPRITE_SIZE, {
          kind: 'unit', itemId: type, civilization: PIRATE_OWNER_FAMILY, motion,
        });
        this.pirateUnits.set(`${type}:${motion}`, img);
        if (motion === 'idle') this.pirateUnits.set(type, img);
      },
    )));
    const landmarkWork = Object.entries(PIRATE_HEADQUARTERS_SPRITE_CATALOG).map(([id, render]) =>
      spriteLoadQueue.schedule(SPRITE_PRIORITY.pirate, async () => {
        if (this.landmarks.has(id)) return;
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

  /** The unit renderer's miss path for pirates: one attempt per start, never one per frame. */
  ensurePirates(): void {
    if (this.piratesLoaded || this.pirateLoad || this.pirateFailed) return;
    void this.loadPirates().catch(() => undefined);
  }

  private unitsFor(civId: string): ReadonlyMap<string, HTMLImageElement> | undefined {
    return civId === PIRATE_OWNER_FAMILY ? this.pirateUnits : this.civs.get(civId)?.units;
  }

  getUnit(type: UnitType, civId: string): HTMLImageElement | null {
    const image = this.unitsFor(civId)?.get(type);
    if (image) return image;
    this.requestInBackground(type, civId);
    return null;
  }

  getUnitMotion(type: UnitType, civId: string, motion: UnitSpriteMotion): HTMLImageElement | null {
    const image = this.unitsFor(civId)?.get(`${type}:${motion}`);
    if (image) return image;
    this.requestInBackground(type, civId);
    return null;
  }

  getBuilding(buildingId: string, civId: string): HTMLImageElement | null {
    const image = this.civs.get(civId)?.buildings.get(buildingId);
    if (image) return image;
    this.requestInBackground(buildingId, civId);
    return null;
  }

  getLandmark(landmarkId: string): HTMLImageElement | null {
    return this.landmarks.get(landmarkId) ?? null;
  }

  /** Entry counts, for diagnostics and the lifecycle tests: a stable campaign must not grow these. */
  stats(): SpriteCacheStats {
    let unitImages = this.pirateUnits.size;
    let buildingImages = 0;
    for (const bucket of this.civs.values()) {
      unitImages += bucket.units.size;
      buildingImages += bucket.buildings.size;
    }
    return { civilizations: this.civs.size, unitImages, buildingImages, landmarkImages: this.landmarks.size };
  }
}

export const spriteCache = new SpriteCache();

export function getSpriteCacheStats(): SpriteCacheStats {
  return spriteCache.stats();
}

/**
 * Starts a campaign's sprites (`startGame`, once per new game, loaded save or hot-seat entry): registers
 * every civilization's palette, loads the pirate set, and creates the sprites in `demand` (what the
 * starting state needs). Resolves when those are cached. Anything else the game later draws is created
 * on its first cache miss. Unchanged demand does no work; see `SpriteCache` for the lifecycle.
 */
export async function initSprites(
  civColors: Record<string, string>,
  demand: ReadonlyArray<SpriteDemandItem>,
): Promise<void> {
  spriteCache.beginCampaign(civColors);
  await Promise.all([
    spriteCache.loadPirates(),
    ...demand.map(item => spriteCache.request(item.id, item.civId)),
  ]);
}
