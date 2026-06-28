export class RoundPresentationGate {
  private depth = 0;

  suppress(): void {
    this.depth += 1;
  }

  resume(): void {
    this.depth = Math.max(0, this.depth - 1);
  }

  isSuppressed(): boolean {
    return this.depth > 0;
  }

  get suppressionDepth(): number {
    return this.depth;
  }
}
