import type { GameState, HexCoord, Unit, VisibilityMap } from '@/core/types';
import { Camera } from './camera';
import { drawHexMap, drawRivers, drawMinorCivTerritory, drawHexHighlight } from './hex-renderer';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { drawFogOfWar } from './fog-renderer';
import { drawUnits } from './unit-renderer';
import { drawCities } from './city-renderer';
import { AnimationSystem } from './animation-system';
import { hexToPixel } from '@/systems/hex-utils';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';
import { getVisibility } from '@/systems/fog-of-war';
import { createMovementAnimation, getMovementAnimationPosition, getMovingUnitIds, type UnitMovementAnimation } from './unit-movement-animation';
import { resolveUnitVisual } from './unit-visual-resolver';
import { drawUnitGlyph } from './unit-renderer';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';

export interface HexHighlight {
  coord: HexCoord;
  type: 'move' | 'attack' | 'worker-buildable' | 'worker-owned-blocked' | 'worker-foreign-blocked';
}

const HEX_HIGHLIGHT_COLORS: Record<HexHighlight['type'], string> = {
  move: 'rgba(74, 144, 217, 0.35)',
  attack: 'rgba(217, 74, 74, 0.45)',
  'worker-buildable': 'rgba(80, 200, 120, 0.45)',
  'worker-owned-blocked': 'rgba(232, 193, 112, 0.40)',
  'worker-foreign-blocked': 'rgba(217, 74, 74, 0.35)',
};

export class RenderLoop {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  camera: Camera;
  animations: AnimationSystem;
  private state: GameState | null = null;
  private running = false;
  private animFrameId = 0;
  private highlights: HexHighlight[] = [];
  private unitMovementAnimations: Array<UnitMovementAnimation & { startTime: number; onComplete?: () => void }> = [];

  setHighlights(highlights: HexHighlight[]): void {
    this.highlights = highlights;
  }

  clearHighlights(): void {
    this.highlights = [];
  }

  animateUnitMove(unit: Unit, from: HexCoord, to: HexCoord, onComplete?: () => void): void {
    if (!this.state) return;
    this.unitMovementAnimations.push({
      ...createMovementAnimation(unit, from, to, this.state.map),
      startTime: performance.now(),
      onComplete,
    });
  }

  hasMovingUnit(unitId: string): boolean {
    return this.unitMovementAnimations.some(animation => animation.unit.id === unitId);
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = new Camera();
    this.animations = new AnimationSystem();
    this.resizeCanvas();
  }

  resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.camera.setViewport(rect.width, rect.height);
  }

  setGameState(state: GameState): void {
    this.state = state;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    this.camera.applyInertia();
    this.render();

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    if (!this.state) return;
    const viewerId = this.state.currentPlayer;
    const viewerVisibility = this.state.civilizations[viewerId]?.visibility;

    const { width, height } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    // Background
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, width, height);

    // Draw hex map
    const villagePositions = new Set(
      Object.values(this.state.tribalVillages ?? {}).map(v => `${v.position.q},${v.position.r}`),
    );
    drawHexMap(this.ctx, this.state.map, this.camera, villagePositions, viewerId, viewerVisibility);

    // Draw rivers
    drawRivers(this.ctx, this.state.map, this.camera, viewerVisibility);

    // Draw minor civ territory
    if (this.state.minorCivs) {
      for (const mc of Object.values(this.state.minorCivs)) {
        if (mc.isDestroyed) continue;
        const city = this.state.cities[mc.cityId];
        if (!city) continue;
        const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
        if (!def) continue;
        drawMinorCivTerritory(
          this.ctx,
          city.position,
          def.color,
          this.camera,
          this.state.map.width,
          this.state.map.wrapsHorizontally,
          viewerVisibility,
          viewerId,
          mc.id,
        );
      }
    }

    // Draw movement/attack highlights (behind units and cities)
    for (const highlight of this.highlights) {
      const renderCoords = this.state.map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(highlight.coord, this.state.map.width, this.camera)
        : [highlight.coord];

      for (const renderCoord of renderCoords) {
        if (!this.camera.isHexVisible(renderCoord)) continue;
        const pixel = hexToPixel(renderCoord, this.camera.hexSize);
        const screen = this.camera.worldToScreen(pixel.x, pixel.y);
        const scaledSize = this.camera.hexSize * this.camera.zoom;
        const color = HEX_HIGHLIGHT_COLORS[highlight.type];
        drawHexHighlight(this.ctx, screen.x, screen.y, scaledSize, color);
      }
    }

    // Draw cities
    drawCities(this.ctx, this.state, this.camera, viewerId);
    this.drawInfiltratedSpyIndicators();
    this.drawEmbeddedSpyIndicators();

    // Draw units
    if (viewerVisibility) {
      const colorLookup: Record<string, string> = { barbarian: '#8b4513' };
      for (const [id, civ] of Object.entries(this.state.civilizations)) {
        colorLookup[id] = civ.color;
      }
      // Add minor civ colors
      for (const mc of Object.values(this.state.minorCivs ?? {})) {
        const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
        if (def) colorLookup[mc.id] = def.color;
      }
      const visibleUnits = getVisibleUnitsForPlayer(this.state.units, this.state, viewerId);
      drawUnits(this.ctx, visibleUnits, this.camera, viewerVisibility, this.state, viewerId, colorLookup, {
        hiddenUnitIds: getMovingUnitIds(this.unitMovementAnimations),
      });
      this.drawUnitMovementAnimations(performance.now(), colorLookup, viewerVisibility);
    }

    // Draw fog of war
    if (viewerVisibility) {
      drawFogOfWar(
        this.ctx,
        viewerVisibility,
        this.state.map.width,
        this.state.map.height,
        this.camera,
        this.state.map.wrapsHorizontally,
      );
    }

    // Draw animations
    this.animations.update(this.ctx, performance.now());
  }

  private drawUnitMovementAnimations(
    now: number,
    colorLookup: Record<string, string>,
    viewerVisibility: VisibilityMap,
  ): void {
    if (!this.state) return;
    const remaining: typeof this.unitMovementAnimations = [];
    const completedCallbacks: Array<() => void> = [];
    for (const animation of this.unitMovementAnimations) {
      const elapsed = now - animation.startTime;
      const progress = Math.min(1, elapsed / animation.duration);
      const frame = getMovementAnimationPosition(animation, progress);
      if (getVisibility(viewerVisibility, animation.to) === 'unexplored') {
        if (progress < 1) remaining.push(animation);
        continue;
      }
      const renderCoords = this.state.map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(frame.coord, this.state.map.width, this.camera)
        : [frame.coord];
      const visual = resolveUnitVisual(this.state, animation.unit, colorLookup, frame.motion);
      const useSprites = this.camera.zoom >= LOD_SPRITE_ZOOM_THRESHOLD;
      const sprite = useSprites
        ? spriteCache.getUnitMotion(animation.unit.type, visual.spriteOwnerId, frame.motion)
        : null;
      for (const renderCoord of renderCoords) {
        if (!this.camera.isHexVisible(renderCoord)) continue;
        const pixel = hexToPixel(renderCoord, this.camera.hexSize);
        const screen = this.camera.worldToScreen(pixel.x, pixel.y);
        drawUnitGlyph(this.ctx, this.state, animation.unit, screen.x, screen.y, this.camera.hexSize * this.camera.zoom, colorLookup, {
          stackSize: 1,
          stackIndex: 0,
          motion: frame.motion,
          useSprites,
          spriteOverride: sprite,
        });
      }
      if (progress < 1) {
        remaining.push(animation);
      } else {
        if (animation.onComplete) completedCallbacks.push(animation.onComplete);
      }
    }
    this.unitMovementAnimations = remaining;
    for (const callback of completedCallbacks) {
      callback();
    }
  }

  private drawEmbeddedSpyIndicators(): void {
    if (!this.state) return;
    const civEsp = this.state.espionage?.[this.state.currentPlayer];
    if (!civEsp) return;
    this.ctx.save();
    for (const spy of Object.values(civEsp.spies)) {
      if (spy.status !== 'embedded' || !spy.targetCityId) continue;
      const city = this.state.cities[spy.targetCityId];
      if (!city || city.owner !== this.state.currentPlayer) continue;
      const pixel = hexToPixel(city.position, this.camera.hexSize);
      const screen = this.camera.worldToScreen(pixel.x, pixel.y);
      const size = this.camera.hexSize * this.camera.zoom;
      this.ctx.font = `${size * 0.3}px system-ui`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('🛡', screen.x - size * 0.5, screen.y - size * 0.4);
    }
    this.ctx.restore();
  }

  private drawInfiltratedSpyIndicators(): void {
    if (!this.state) return;
    const civEsp = this.state.espionage?.[this.state.currentPlayer];
    if (!civEsp) return;
    this.ctx.save();
    for (const spy of Object.values(civEsp.spies)) {
      if (spy.status !== 'stationed' && spy.status !== 'on_mission' && spy.status !== 'idle') continue;
      if (!spy.infiltrationCityId) continue;
      const city = this.state.cities[spy.infiltrationCityId];
      if (!city) continue;
      const pixel = hexToPixel(city.position, this.camera.hexSize);
      const screen = this.camera.worldToScreen(pixel.x, pixel.y);
      const size = this.camera.hexSize * this.camera.zoom;
      this.ctx.font = `${size * 0.3}px system-ui`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('👁', screen.x + size * 0.5, screen.y - size * 0.4);
    }
    this.ctx.restore();
  }
}
