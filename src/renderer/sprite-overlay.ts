import { hexToPixel } from '@/systems/hex-utils';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
import {
  getUnitSpriteV2,
  getBuildingSpriteV2,
  getImprovementSpriteV2,
} from './sprites/v2/index';
import type { Camera } from './camera';
import type { HexCoord } from '@/core/types';

/**
 * Sprite wrappers live in world-space (sizes are in pre-zoom units).
 * The container applies scale(camera.zoom), so children sized in world units.
 * At zoom = 2 (= BUILDING_SPRITE_SIZE / (hexSize * SPRITE_OVERLAY_WORLD_SIZE_FACTOR)),
 * building sprites (192px native) render at their design size.
 * Unit sprites (128px native) render at their native size at zoom = 2.
 */
export const SPRITE_OVERLAY_WORLD_SIZE_FACTOR = 2;

export interface SpriteEntity {
  id:      string;
  kind:    'unit' | 'building' | 'improvement';
  subtype: string;
  coord:   HexCoord;
  /**
   * v2 animation state — NOT the same as UnitMotionState ('move-a' | 'move-b').
   * RenderLoop translates: 'move-a' | 'move-b' → 'walk'.
   */
  state:   'idle' | 'walk' | 'attack';
  /** Sprite palette name derived from owner's civType via civTypeToFaction() — e.g. 'imperials', 'pharaohs', 'vikings'. */
  faction: string;
}

interface PoolEntry {
  el:           HTMLDivElement; // positional wrapper (world-space left/top)
  spriteWrapEl: HTMLElement;    // .cq-sprite-wrap.cq-v2 — animation root
  phase:        number;
  faction:      string;
  coord:        HexCoord;       // stored so we can detect position change after movement
}

// djb2 hash — deterministic, no external dependency
export function hashCode(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

export class SpriteOverlay {
  private container: HTMLDivElement;
  private layers: Record<SpriteEntity['kind'], HTMLDivElement>;
  private pool = new Map<string, PoolEntry>();
  private _activeIds = new Set<string>();

  constructor(mountPoint: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'sprite-overlay';
    this.container.style.cssText =
      'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;' +
      'pointer-events:none;transform-origin:top left;will-change:transform';
    // contain: layout style — NOT paint (paint clips the 0×0 box making sprites invisible)
    this.container.style.setProperty('contain', 'layout style');

    const unit = makeLayer('unit-sprites');
    const building = makeLayer('building-sprites');
    const improvement = makeLayer('improvement-sprites');
    this.container.appendChild(unit);
    this.container.appendChild(building);
    this.container.appendChild(improvement);
    this.layers = { unit, building, improvement };

    const uiLayer = mountPoint.querySelector('#ui-layer');
    if (uiLayer) mountPoint.insertBefore(this.container, uiLayer);
    else mountPoint.appendChild(this.container);
  }

  sync(
    camera: Camera,
    entities: SpriteEntity[],
    map: { width: number; wrapsHorizontally: boolean },
    opts: { isPinching: boolean; reducedMotion: boolean },
  ): void {
    // 1. LOD + reduced-motion gate
    if (camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD || opts.reducedMotion) {
      this.container.style.display = 'none';
      return;
    }
    this.container.style.display = '';

    // 2. Camera transform — one write per frame, always (even during pinch)
    this.container.style.transform =
      `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`;

    // 3. Pinch guard — defer pool mutations, camera transform already updated above
    if (opts.isPinching) return;

    // 4. Entity → DOM
    const seen = new Set<string>();
    for (const entity of entities) {
      const coords = map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(entity.coord, map.width, camera)
        : [entity.coord];

      for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];
        const key = `${entity.id}:${i}`;
        seen.add(key);

        const existing = this.pool.get(key);
        if (existing) {
          // Pool hit — update state via setAttribute (no node replacement!)
          existing.spriteWrapEl.setAttribute('data-state', entity.state);
          // Update world position if unit moved hex after movement animation completed
          if (existing.coord.q !== coord.q || existing.coord.r !== coord.r) {
            const px = hexToPixel(coord, camera.hexSize);
            existing.el.style.left = `${px.x}px`;
            existing.el.style.top = `${px.y}px`;
            existing.coord = coord;
          }
        } else {
          // Pool miss — create element
          const svgHtml = this.lookupSprite(entity);
          if (!svgHtml) continue; // no v2 sprite — canvas handles it

          const phase = (hashCode(entity.id) % 100) / 100;
          const px = hexToPixel(coord, camera.hexSize);

          const wrapper = document.createElement('div');
          const wrapSizePx = camera.hexSize * SPRITE_OVERLAY_WORLD_SIZE_FACTOR;
          wrapper.style.cssText =
            `position:absolute;width:${wrapSizePx}px;height:${wrapSizePx}px;overflow:hidden;` +
            `transform:translate(-50%,-50%);left:${px.x}px;top:${px.y}px`;

          // svgHtml is our own serialized content — safe to use innerHTML
          wrapper.innerHTML = svgHtml;

          // spriteWrapEl = .cq-sprite-wrap.cq-v2 (first child of wrapper, NOT the <svg>)
          // CSS animation selectors key off this element: .cq-v2[data-state="idle"] ...
          const spriteWrapEl = wrapper.firstElementChild as HTMLElement;

          // Override the baked style="--phase:0" — setProperty on same element wins
          spriteWrapEl.style.setProperty('--phase', String(phase));
          spriteWrapEl.setAttribute('data-state', entity.state);

          this.layers[entity.kind].appendChild(wrapper);
          this.pool.set(key, { el: wrapper, spriteWrapEl, phase, faction: entity.faction, coord });
        }
      }
    }

    // 5. Cull stale elements
    for (const [key, entry] of this.pool) {
      if (!seen.has(key)) {
        entry.el.remove();
        this.pool.delete(key);
      }
    }

    // Rebuild activeIds from current pool (key = `${entityId}:${ghostIdx}`)
    this._activeIds.clear();
    for (const key of this.pool.keys()) {
      this._activeIds.add(key.slice(0, key.lastIndexOf(':')));
    }
  }

  private lookupSprite(entity: SpriteEntity): string | null {
    switch (entity.kind) {
      case 'unit':        return getUnitSpriteV2(entity.subtype, entity.faction);
      case 'building':    return getBuildingSpriteV2(entity.subtype, entity.faction);
      case 'improvement': return getImprovementSpriteV2(entity.subtype); // always null
      default:            return null;
    }
  }

  getActiveIds(): ReadonlySet<string> { return this._activeIds; }

  invalidateFaction(faction: string): void {
    const toEvict: string[] = [];
    for (const [key, entry] of this.pool) {
      if (entry.faction === faction) {
        entry.el.remove();
        toEvict.push(key);
      }
    }
    for (const key of toEvict) this.pool.delete(key);
    // Rebuild activeIds
    this._activeIds.clear();
    for (const key of this.pool.keys()) {
      this._activeIds.add(key.slice(0, key.lastIndexOf(':')));
    }
  }
}

function makeLayer(id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;overflow:visible';
  return div;
}
