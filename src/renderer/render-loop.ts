import type { GameState, HexCoord } from '@/core/types';
import { Camera } from './camera';
import { drawHexMap, drawRivers, drawMinorCivTerritory, drawHexHighlight } from './hex-renderer';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { drawFogOfWar } from './fog-renderer';
import { drawUnits } from './unit-renderer';
import { drawCities } from './city-renderer';
import { AnimationSystem } from './animation-system';
import { hexToPixel } from '@/systems/hex-utils';

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

    const { width, height } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    // Background
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, width, height);

    // Draw hex map
    const villagePositions = new Set(
      Object.values(this.state.tribalVillages ?? {}).map(v => `${v.position.q},${v.position.r}`),
    );
    drawHexMap(this.ctx, this.state.map, this.camera, villagePositions, this.state.currentPlayer);

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
        drawMinorCivTerritory(this.ctx, city.position, def.color, this.camera);
      }
    }

    // Draw movement/attack highlights (behind units and cities)
    for (const highlight of this.highlights) {
      if (!this.camera.isHexVisible(highlight.coord)) continue;
      const pixel = hexToPixel(highlight.coord, this.camera.hexSize);
      const screen = this.camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = this.camera.hexSize * this.camera.zoom;
      const color = highlight.type === 'move' ? 'rgba(74, 144, 217, 0.35)' : 'rgba(217, 74, 74, 0.45)';
      drawHexHighlight(this.ctx, screen.x, screen.y, scaledSize, color);
    }

    // Draw cities
    drawCities(this.ctx, this.state, this.camera, this.state.currentPlayer);

    // Draw units
    const currentCiv = this.state.civilizations[this.state.currentPlayer];
    const playerVis = currentCiv?.visibility;
    if (playerVis) {
      const colorLookup: Record<string, string> = { barbarian: '#8b4513' };
      for (const [id, civ] of Object.entries(this.state.civilizations)) {
        colorLookup[id] = civ.color;
      }
      // Add minor civ colors
      for (const mc of Object.values(this.state.minorCivs ?? {})) {
        const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
        if (def) colorLookup[mc.id] = def.color;
      }
      drawUnits(this.ctx, this.state.units, this.camera, playerVis, this.state, this.state.currentPlayer, colorLookup);
    }

    // Draw fog of war
    if (playerVis) {
      drawFogOfWar(
        this.ctx,
        playerVis,
        this.state.map.width,
        this.state.map.height,
        this.camera,
        this.state.map.wrapsHorizontally,
      );
    }

    // Draw animations
    this.animations.update(this.ctx, performance.now());
  }
}
