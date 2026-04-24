import type { GameState, HexCoord } from '@/core/types';
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

export interface HexHighlight {
  coord: HexCoord;
  type: 'move' | 'attack';
}

export class RenderLoop {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  camera: Camera;
  animations: AnimationSystem;
  private state: GameState | null = null;
  private running = false;
  private animFrameId = 0;
  private highlights: HexHighlight[] = [];

  setHighlights(highlights: HexHighlight[]): void {
    this.highlights = highlights;
  }

  clearHighlights(): void {
    this.highlights = [];
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
    drawRivers(this.ctx, this.state.map, this.camera);

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
        const color = highlight.type === 'move' ? 'rgba(74, 144, 217, 0.35)' : 'rgba(217, 74, 74, 0.45)';
        drawHexHighlight(this.ctx, screen.x, screen.y, scaledSize, color);
      }
    }

    // Draw cities
    drawCities(this.ctx, this.state, this.camera, viewerId);
    this.drawInfiltratedSpyIndicators();

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
      drawUnits(this.ctx, visibleUnits, this.camera, viewerVisibility, this.state, viewerId, colorLookup);
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

  private drawInfiltratedSpyIndicators(): void {
    if (!this.state) return;
    const civEsp = this.state.espionage?.[this.state.currentPlayer];
    if (!civEsp) return;
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
  }
}
