export interface Animation {
  id: string;
  type: string;
  startTime: number;
  duration: number;
  data: any;
  onComplete?: () => void;
}

export class AnimationSystem {
  private animations: Animation[] = [];
  private nextId = 1;

  add(type: string, duration: number, data: any, onComplete?: () => void): string {
    const id = `anim-${this.nextId++}`;
    this.animations.push({
      id,
      type,
      startTime: performance.now(),
      duration,
      data,
      onComplete,
    });
    return id;
  }

  update(ctx: CanvasRenderingContext2D, now: number): void {
    const completed: Animation[] = [];

    for (const anim of this.animations) {
      const elapsed = now - anim.startTime;
      const progress = Math.min(1, elapsed / anim.duration);

      this.renderAnimation(ctx, anim, progress);

      if (progress >= 1) {
        completed.push(anim);
      }
    }

    // Remove completed animations
    for (const anim of completed) {
      this.animations = this.animations.filter(a => a.id !== anim.id);
      anim.onComplete?.();
    }
  }

  hasAnimations(): boolean {
    return this.animations.length > 0;
  }

  private renderAnimation(ctx: CanvasRenderingContext2D, anim: Animation, progress: number): void {
    switch (anim.type) {
      case 'hex-reveal': {
        const { x, y, size } = anim.data;
        const alpha = 1 - progress;
        ctx.fillStyle = `rgba(15, 15, 25, ${alpha * 0.95})`;
        ctx.beginPath();
        ctx.arc(x, y, size * (1 + progress * 0.3), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'combat-flash': {
        const { x, y, size } = anim.data;
        const alpha = 1 - progress;
        ctx.fillStyle = `rgba(255, 100, 50, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, size * (0.5 + progress * 0.5), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'wonder-discovery-pulse': {
        const { x, y, size, accent, glow } = anim.data;
        const alpha = 1 - progress;
        ctx.save();
        ctx.strokeStyle = glow;
        ctx.globalAlpha = Math.max(0.15, alpha);
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.beginPath();
        ctx.arc(x, y, size * (0.48 + progress * 0.72), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.max(0.10, alpha * 0.35);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x, y, size * (0.32 + progress * 0.18), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'wonder-discovery-static-highlight': {
        const { x, y, size, accent } = anim.data;
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = Math.max(2, size * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'disembark-flash': {
        // Expanding teal ring — signals a unit has disembarked at this hex.
        const { x, y, size } = anim.data;
        const alpha = 1 - progress;
        ctx.save();
        ctx.strokeStyle = `rgba(74, 200, 217, ${alpha * 0.7})`;
        ctx.lineWidth = Math.max(1, size * 0.04);
        ctx.beginPath();
        ctx.arc(x, y, size * (0.3 + progress * 0.4), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }
}
