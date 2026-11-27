import { Camera } from '@/renderer/camera';
import type { InputCallbacks } from './touch-handler';

export class MouseHandler {
  private camera: Camera;
  private callbacks: InputCallbacks;
  private canvas: HTMLCanvasElement;
  private canInteract: () => boolean;
  private isPointerDown = false;
  private isDragging = false;
  private mouseDownPos = { x: 0, y: 0 };
  private lastMouse = { x: 0, y: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera,
    callbacks: InputCallbacks,
    options: { canInteract?: () => boolean } = {},
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;
    this.canInteract = options.canInteract ?? (() => true);

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
      this.isPointerDown = true;
      this.isDragging = false;
      this.mouseDownPos = { x: e.clientX, y: e.clientY };
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!(e.buttons & 1)) {
      this.isPointerDown = false;
      return;
    }
    if (!this.isPointerDown) {
      return;
    }

    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    const totalDx = e.clientX - this.mouseDownPos.x;
    const totalDy = e.clientY - this.mouseDownPos.y;

    if (Math.abs(totalDx) > 3 || Math.abs(totalDy) > 3) {
      this.isDragging = true;
    }

    this.camera.pan(dx, dy);
    this.lastMouse = { x: e.clientX, y: e.clientY };
  };

  private onMouseUp = (e: MouseEvent): void => {
    const wasPointerDown = this.isPointerDown;
    const wasDragging = this.isDragging;
    this.isPointerDown = false;
    this.isDragging = false;
    if (!this.canInteract()) {
      return;
    }
    if (e.button === 0 && wasPointerDown && !wasDragging) {
      const coord = this.camera.screenToHex(e.clientX, e.clientY);
      this.callbacks.onHexTap(coord);
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.camera.smoothZoom(e.deltaY, e.clientX, e.clientY);
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (!this.canInteract()) {
      return;
    }
    const coord = this.camera.screenToHex(e.clientX, e.clientY);
    this.callbacks.onHexLongPress(coord);
  };
}
