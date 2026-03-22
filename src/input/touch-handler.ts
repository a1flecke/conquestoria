import { Camera } from '@/renderer/camera';
import type { HexCoord } from '@/core/types';

export interface InputCallbacks {
  onHexTap: (coord: HexCoord) => void;
  onHexLongPress: (coord: HexCoord) => void;
}

export class TouchHandler {
  private camera: Camera;
  private callbacks: InputCallbacks;
  private canvas: HTMLCanvasElement;

  private lastTouchDistance = 0;
  private lastTouchCenter = { x: 0, y: 0 };
  private touchStartTime = 0;
  private touchStartPos = { x: 0, y: 0 };
  private longPressTimer: number | null = null;
  private isPanning = false;

  constructor(canvas: HTMLCanvasElement, camera: Camera, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;

    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  destroy(): void {
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.onTouchEnd);
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.touchStartTime = Date.now();
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };
      this.lastTouchCenter = { x: touch.clientX, y: touch.clientY };
      this.isPanning = false;

      // Start long press timer
      this.longPressTimer = window.setTimeout(() => {
        if (!this.isPanning) {
          const coord = this.camera.screenToHex(touch.clientX, touch.clientY);
          this.callbacks.onHexLongPress(coord);
        }
      }, 500);
    }

    if (e.touches.length === 2) {
      this.clearLongPress();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
      this.lastTouchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - this.lastTouchCenter.x;
      const dy = touch.clientY - this.lastTouchCenter.y;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        this.isPanning = true;
        this.clearLongPress();
      }

      this.camera.pan(dx, dy);
      this.camera.vx = dx;
      this.camera.vy = dy;
      this.lastTouchCenter = { x: touch.clientX, y: touch.clientY };
    }

    if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (this.lastTouchDistance > 0) {
        const scale = distance / this.lastTouchDistance;
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        this.camera.setZoom(this.camera.zoom * scale, centerX, centerY);
      }

      this.lastTouchDistance = distance;

      // Pan with two fingers
      const center = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      this.camera.pan(center.x - this.lastTouchCenter.x, center.y - this.lastTouchCenter.y);
      this.lastTouchCenter = center;
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    this.clearLongPress();

    if (e.changedTouches.length === 1 && !this.isPanning) {
      const elapsed = Date.now() - this.touchStartTime;
      if (elapsed < 300) {
        // Tap
        const touch = e.changedTouches[0];
        const coord = this.camera.screenToHex(touch.clientX, touch.clientY);
        this.callbacks.onHexTap(coord);
      }
    }

    this.lastTouchDistance = 0;
  };

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
