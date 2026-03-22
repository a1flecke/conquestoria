import { Camera } from '@/renderer/camera';
import type { InputCallbacks } from './touch-handler';

export class MouseHandler {
  private camera: Camera;
  private callbacks: InputCallbacks;
  private canvas: HTMLCanvasElement;
  private isDragging = false;
  private lastMouse = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, camera: Camera, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;

    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isDragging = false;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (e.buttons & 1) {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.isDragging = true;
      }

      this.camera.pan(dx, dy);
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0 && !this.isDragging) {
      const coord = this.camera.screenToHex(e.clientX, e.clientY);
      this.callbacks.onHexTap(coord);
    }
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.camera.smoothZoom(e.deltaY, e.clientX, e.clientY);
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const coord = this.camera.screenToHex(e.clientX, e.clientY);
    this.callbacks.onHexLongPress(coord);
  };
}
