import type { GameState } from '@/core/types';
import { Camera } from './camera';
import { drawHexMap, drawRivers } from './hex-renderer';
import { drawFogOfWar } from './fog-renderer';
import { drawUnits } from './unit-renderer';
import { drawCities } from './city-renderer';
import { AnimationSystem } from './animation-system';

export class RenderLoop {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  camera: Camera;
  animations: AnimationSystem;
  private state: GameState | null = null;
  private running = false;
  private animFrameId = 0;

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
    drawHexMap(this.ctx, this.state.map, this.camera, villagePositions);

    // Draw rivers
    drawRivers(this.ctx, this.state.map, this.camera);

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
      drawUnits(this.ctx, this.state.units, this.camera, playerVis, colorLookup);
    }

    // Draw fog of war
    if (playerVis) {
      drawFogOfWar(this.ctx, playerVis, this.state.map.width, this.state.map.height, this.camera);
    }

    // Draw animations
    this.animations.update(this.ctx, performance.now());
  }
}
