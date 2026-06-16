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
import { applyUnitAnchorOffset, getUnitLayoutMetrics } from './unit-map-presentation';
import type { UnitRoleMarker } from './unit-visual-resolver';

// Faction accent colors baked into serialized sprite SVG fills by scripts/serialize-sprites.mjs.
// Must match the palette.secondary value from the source sprite TSX files.
const FACTION_SPRITE_ACCENT: Record<string, string> = {
  imperials: '#b53026',
  vikings:   '#1d4a8c',
  pharaohs:  '#d4a13c',
  hellenes:  '#2c8a5a',
  khanate:   '#7a3a14',
  shogunate: '#5b4a7a',
};

export function applyFactionCivColor(svgHtml: string, faction: string, civColor: string): string {
  const accent = FACTION_SPRITE_ACCENT[faction];
  if (!accent || !civColor || civColor === accent) return svgHtml;
  return svgHtml.replaceAll(accent, civColor);
}

/** Sprite wrappers live in world-space; the container applies camera zoom. */
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
  /**
   * Damage tier 0–3 driven by unit health. Controls cq-wound visibility via data-damage CSS selectors.
   * 0 = healthy (76–100 HP), 1 = wounded (51–75), 2 = bloodied (26–50), 3 = near-death (0–25).
   * Always 0 for non-combat units (strength === 0). Defaults to 0 when absent.
   */
  damage?: number;
  /** Canonical unit IDs represented by this one static stack element. */
  memberIds?: string[];
  stackCount?: number;
  selected?: boolean;
  health?: number;
  fortified?: boolean;
  roleMarker?: UnitRoleMarker;
  anchorOffsetFactor?: { x: number; y: number };
  /** Owner civ ID used to look up the game-assigned color for accent replacement. */
  civId?: string;
}

interface PoolEntry {
  el:           HTMLDivElement; // positional wrapper (world-space left/top)
  spriteWrapEl: HTMLElement;    // .cq-sprite-wrap.cq-v2 — animation root
  phase:        number;
  faction:      string;
  civColor:     string;
  coord:        HexCoord;       // stored so we can detect position change after movement
  memberIds:    string[];
  anchorOffsetFactor: { x: number; y: number };
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
    colorLookup: Record<string, string> = {},
  ): void {
    // 1. LOD + reduced-motion gate
    if (camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD || opts.reducedMotion) {
      this.container.style.display = 'none';
      this.clearPool();
      this._activeIds.clear();
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

        const anchorOffsetFactor = entity.anchorOffsetFactor ?? { x: 0, y: 0 };
        const newCivColor = entity.civId ? (colorLookup[entity.civId] ?? '') : '';
        const poolEntry = this.pool.get(key);
        // Invalidate if faction or civ color changed (e.g. unit captured or color reassigned)
        if (poolEntry && (poolEntry.faction !== entity.faction || poolEntry.civColor !== newCivColor)) {
          poolEntry.el.remove();
          this.pool.delete(key);
        }
        if (this.pool.has(key)) {
          const existing = this.pool.get(key)!;
          // Pool hit — update state via setAttribute (no node replacement!)
          existing.spriteWrapEl.setAttribute('data-state', entity.state);
          existing.spriteWrapEl.setAttribute('data-damage', String(entity.damage ?? 0));
          existing.memberIds = entity.memberIds ?? [entity.id];
          existing.el.dataset.entityId = entity.id;
          existing.el.dataset.memberIds = existing.memberIds.join(',');
          if (entity.kind === 'unit') updateUnitDecorations(existing.el, entity);
          // Update world position if unit moved hex after movement animation completed
          if (
            existing.coord.q !== coord.q
            || existing.coord.r !== coord.r
            || existing.anchorOffsetFactor.x !== anchorOffsetFactor.x
            || existing.anchorOffsetFactor.y !== anchorOffsetFactor.y
          ) {
            const rawPx = hexToPixel(coord, camera.hexSize);
            const px = applyUnitAnchorOffset(rawPx, camera.hexSize, anchorOffsetFactor);
            existing.el.style.left = `${px.x}px`;
            existing.el.style.top = `${px.y}px`;
            existing.coord = coord;
            existing.anchorOffsetFactor = anchorOffsetFactor;
          }
        } else {
          // Pool miss — create element
          const rawSvgHtml = this.lookupSprite(entity);
          if (!rawSvgHtml) continue; // no v2 sprite — canvas handles it
          const svgHtml = applyFactionCivColor(rawSvgHtml, entity.faction, newCivColor);

          const phase = (hashCode(entity.id) % 100) / 100;
          const rawPx = hexToPixel(coord, camera.hexSize);
          const px = applyUnitAnchorOffset(rawPx, camera.hexSize, anchorOffsetFactor);

          const wrapper = document.createElement('div');
          wrapper.dataset.entityId = entity.id;
          wrapper.dataset.memberIds = (entity.memberIds ?? [entity.id]).join(',');
          const wrapSizePx = entity.kind === 'unit'
            ? getUnitLayoutMetrics(camera.hexSize).displaySize
            : camera.hexSize * 2;
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
          spriteWrapEl.setAttribute('data-damage', String(entity.damage ?? 0));
          if (entity.kind === 'unit') updateUnitDecorations(wrapper, entity);

          this.layers[entity.kind].appendChild(wrapper);
          this.pool.set(key, {
            el: wrapper,
            spriteWrapEl,
            phase,
            faction: entity.faction,
            civColor: newCivColor,
            coord,
            memberIds: entity.memberIds ?? [entity.id],
            anchorOffsetFactor,
          });
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
    for (const entry of this.pool.values()) {
      for (const memberId of entry.memberIds) this._activeIds.add(memberId);
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

  private clearPool(): void {
    for (const entry of this.pool.values()) entry.el.remove();
    this.pool.clear();
  }

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
    for (const entry of this.pool.values()) {
      for (const memberId of entry.memberIds) this._activeIds.add(memberId);
    }
  }
}

function getOrCreateDecoration(wrapper: HTMLElement, className: string): HTMLDivElement {
  const existing = wrapper.querySelector(`.${className}`);
  if (existing) return existing as HTMLDivElement;
  const element = document.createElement('div');
  element.className = className;
  wrapper.appendChild(element);
  return element;
}

function removeDecoration(wrapper: HTMLElement, className: string): void {
  wrapper.querySelector(`.${className}`)?.remove();
}

function updateUnitDecorations(wrapper: HTMLElement, entity: SpriteEntity): void {
  if (entity.selected) {
    const ring = getOrCreateDecoration(wrapper, 'cq-unit-selected');
    ring.style.cssText =
      'position:absolute;inset:4%;border:2px solid #ffd54f;border-radius:50%;' +
      'box-sizing:border-box;pointer-events:none';
  } else {
    removeDecoration(wrapper, 'cq-unit-selected');
  }

  if ((entity.stackCount ?? 1) > 1) {
    const pill = getOrCreateDecoration(wrapper, 'cq-unit-stack-count');
    pill.style.cssText =
      'position:absolute;right:2%;top:2%;min-width:42%;height:28%;border-radius:999px;' +
      'background:rgba(0,0,0,.82);border:1px solid rgba(255,255,255,.85);color:#fff;' +
      'font:700 0.65em system-ui;display:flex;align-items:center;justify-content:center;' +
      'gap:2px;padding:0 3%;pointer-events:none';
    const icon = document.createElement('span');
    icon.textContent = '🪖️';
    icon.style.cssText = 'font-size:0.9em;line-height:1';
    const label = document.createElement('span');
    label.textContent = `×${entity.stackCount}`;
    label.style.cssText = 'font-weight:700';
    pill.replaceChildren(icon, label);
  } else {
    removeDecoration(wrapper, 'cq-unit-stack-count');
  }

  if ((entity.health ?? 100) < 100) {
    const health = getOrCreateDecoration(wrapper, 'cq-unit-health');
    health.style.cssText =
      'position:absolute;left:29%;bottom:8%;width:42%;height:6%;background:rgba(0,0,0,.6);pointer-events:none';
    let fill = health.querySelector('.cq-unit-health-fill') as HTMLDivElement | null;
    if (!fill) {
      fill = document.createElement('div');
      fill.className = 'cq-unit-health-fill';
      health.appendChild(fill);
    }
    const healthValue = Math.max(0, Math.min(100, entity.health ?? 100));
    fill.style.cssText = `height:100%;width:${healthValue}%;background:${healthValue > 50 ? '#4caf50' : healthValue > 25 ? '#ff9800' : '#f44336'}`;
  } else {
    removeDecoration(wrapper, 'cq-unit-health');
  }

  if (entity.fortified) {
    const fortified = getOrCreateDecoration(wrapper, 'cq-unit-fortified');
    fortified.textContent = '🛡️';
    fortified.style.cssText =
      'position:absolute;left:3%;top:3%;width:28%;height:28%;border-radius:50%;' +
      'background:rgba(200,150,0,.92);border:1px solid #fff;color:#fff;' +
      'font:700 0.65em system-ui;display:flex;align-items:center;justify-content:center;pointer-events:none';
  } else {
    removeDecoration(wrapper, 'cq-unit-fortified');
  }

  if (entity.roleMarker) {
    const role = getOrCreateDecoration(wrapper, 'cq-unit-role');
    role.textContent = entity.roleMarker === 'chevron' ? '⌄' : '◆';
    role.style.cssText =
      'position:absolute;right:7%;bottom:18%;color:#fff;text-shadow:0 1px 2px #000;' +
      'font:700 0.7em system-ui;pointer-events:none';
  } else {
    removeDecoration(wrapper, 'cq-unit-role');
  }
}

function makeLayer(id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;overflow:visible';
  return div;
}
