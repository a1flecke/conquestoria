import { hexToPixel, pixelToHex } from '@/systems/hex-utils';
import type { HexCoord } from '@/core/types';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  targetZoom = 1;
  minZoom = 0.3;
  maxZoom = 3;
  width = 0;
  height = 0;
  hexSize = 32;

  // Velocity for smooth panning
  vx = 0;
  vy = 0;
  friction = 0.9;

  setViewport(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  centerOn(coord: HexCoord): void {
    const pixel = hexToPixel(coord, this.hexSize);
    this.x = pixel.x - this.width / (2 * this.zoom);
    this.y = pixel.y - this.height / (2 * this.zoom);
  }

  pan(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  setZoom(zoom: number, centerX: number, centerY: number): void {
    const oldZoom = this.zoom;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.targetZoom = this.zoom;

    // Zoom toward the center point
    const factor = 1 - oldZoom / this.zoom;
    this.x += (centerX / oldZoom) * factor;
    this.y += (centerY / oldZoom) * factor;
  }

  smoothZoom(delta: number, centerX: number, centerY: number): void {
    const factor = delta > 0 ? 0.9 : 1.1;
    this.setZoom(this.zoom * factor, centerX, centerY);
  }

  applyInertia(): void {
    if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
      this.x -= this.vx / this.zoom;
      this.y -= this.vy / this.zoom;
      this.vx *= this.friction;
      this.vy *= this.friction;
    } else {
      this.vx = 0;
      this.vy = 0;
    }
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom,
    };
  }

  screenToHex(sx: number, sy: number): HexCoord {
    const world = this.screenToWorld(sx, sy);
    return pixelToHex(world.x, world.y, this.hexSize);
  }

  isHexVisible(coord: HexCoord): boolean {
    const pixel = hexToPixel(coord, this.hexSize);
    const screen = this.worldToScreen(pixel.x, pixel.y);
    const margin = this.hexSize * this.zoom * 2;
    return (
      screen.x > -margin &&
      screen.x < this.width + margin &&
      screen.y > -margin &&
      screen.y < this.height + margin
    );
  }
}
