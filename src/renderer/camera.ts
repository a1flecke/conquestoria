import { hexToPixel, pixelToHex } from '@/systems/hex-utils';
import type { HexCoord } from '@/core/types';

type CameraListener = () => void;

/**
 * Every camera field that affects pixels is an accessor: a write from anywhere (input handlers,
 * controllers, tests) publishes a change, so no caller has to remember to wake the renderer (#1439).
 * Compound operations (pan, centerOn, setZoom, inertia) write privately and publish once.
 */
export class Camera {
  private _x = 0;
  private _y = 0;
  private _zoom = 1;
  private _targetZoom = 1;
  private _minZoom = 0.3;
  private _maxZoom = 3;
  private _width = 0;
  private _height = 0;
  private _vx = 0;
  private _vy = 0;
  hexSize = 32;
  friction = 0.9;
  private listeners = new Set<CameraListener>();

  get x(): number { return this._x; }
  set x(value: number) { this.commit(() => { this._x = value; }); }
  get y(): number { return this._y; }
  set y(value: number) { this.commit(() => { this._y = value; }); }
  get zoom(): number { return this._zoom; }
  set zoom(value: number) { this.commit(() => { this._zoom = value; }); }
  get targetZoom(): number { return this._targetZoom; }
  set targetZoom(value: number) { this.commit(() => { this._targetZoom = value; }); }
  get minZoom(): number { return this._minZoom; }
  set minZoom(value: number) { this.commit(() => { this._minZoom = value; }); }
  get maxZoom(): number { return this._maxZoom; }
  set maxZoom(value: number) { this.commit(() => { this._maxZoom = value; }); }
  get width(): number { return this._width; }
  set width(value: number) { this.commit(() => { this._width = value; }); }
  get height(): number { return this._height; }
  set height(value: number) { this.commit(() => { this._height = value; }); }
  /** Fling velocity (px/frame); written by the touch handler, decayed by applyInertia. */
  get vx(): number { return this._vx; }
  set vx(value: number) { this.commit(() => { this._vx = value; }); }
  get vy(): number { return this._vy; }
  set vy(value: number) { this.commit(() => { this._vy = value; }); }

  /** Subscribe to any change of position, zoom, viewport, bounds or velocity. Returns the unsubscribe. */
  onChange(listener: CameraListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** True while fling velocity still has frames left to advance. */
  isMoving(): boolean {
    return this._vx !== 0 || this._vy !== 0;
  }

  /** Run a mutation and publish once, only if some field actually changed. */
  private commit(mutate: () => void): void {
    const before = [this._x, this._y, this._zoom, this._targetZoom, this._minZoom, this._maxZoom,
      this._width, this._height, this._vx, this._vy];
    mutate();
    const after = [this._x, this._y, this._zoom, this._targetZoom, this._minZoom, this._maxZoom,
      this._width, this._height, this._vx, this._vy];
    if (before.some((value, i) => !Object.is(value, after[i]))) {
      for (const listener of [...this.listeners]) listener();
    }
  }

  setViewport(width: number, height: number): void {
    this.commit(() => { this._width = width; this._height = height; });
  }

  centerOn(coord: HexCoord): void {
    const pixel = hexToPixel(coord, this.hexSize);
    this.commit(() => {
      this._x = pixel.x - this._width / (2 * this._zoom);
      this._y = pixel.y - this._height / (2 * this._zoom);
    });
  }

  pan(dx: number, dy: number): void {
    this.commit(() => {
      this._x -= dx / this._zoom;
      this._y -= dy / this._zoom;
    });
  }

  setZoom(zoom: number, centerX: number, centerY: number): void {
    this.commit(() => {
      const oldZoom = this._zoom;
      this._zoom = Math.max(this._minZoom, Math.min(this._maxZoom, zoom));
      this._targetZoom = this._zoom;

      // Zoom toward the center point
      const factor = 1 - oldZoom / this._zoom;
      this._x += (centerX / oldZoom) * factor;
      this._y += (centerY / oldZoom) * factor;
    });
  }

  smoothZoom(delta: number, centerX: number, centerY: number): void {
    const factor = delta > 0 ? 0.9 : 1.1;
    this.setZoom(this._zoom * factor, centerX, centerY);
  }

  applyInertia(): void {
    this.commit(() => {
      if (Math.abs(this._vx) > 0.1 || Math.abs(this._vy) > 0.1) {
        this._x -= this._vx / this._zoom;
        this._y -= this._vy / this._zoom;
        this._vx *= this.friction;
        this._vy *= this.friction;
      } else {
        this._vx = 0;
        this._vy = 0;
      }
    });
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

  /**
   * Compute minZoom so that the visible world width never exceeds the map's
   * pixel span. This prevents getHorizontalWrapRenderCoords from rendering the
   * map more than once side-by-side when the player zooms all the way out.
   *
   * `mapWidthPx` should equal hexToPixel({q: map.width, r:0}, hexSize).x,
   * which is the same value used as `wrapSpan` in wrap-rendering.ts.
   */
  setMinZoomForMap(mapWidthPx: number): void {
    if (mapWidthPx <= 0 || this._width <= 0) return;
    this.commit(() => {
      this._minZoom = this._width / mapWidthPx;
      if (this._zoom < this._minZoom) {
        this._zoom = this._minZoom;
        this._targetZoom = this._minZoom;
      }
    });
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
