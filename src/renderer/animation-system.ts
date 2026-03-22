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
    }
  }
}
