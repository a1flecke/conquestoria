/**
 * #1072 — shared deterministic recording Canvas 2D context (test-only).
 *
 * The renderer draws to `CanvasRenderingContext2D`. Counting its draw calls in
 * vitest needs a headless stub that records machine-independent operation
 * counts without a real GPU/DOM. This is that stub, shared so render-budget
 * tests never each invent a partial mock that could silently make a test
 * vacuous.
 *
 * Design:
 * - implements exactly the Canvas 2D surface the measured base frame path
 *   uses (tiles, rivers, roads, cities, units, fog). Property setters are
 *   accepted harmlessly and never counted.
 * - every METHOD call increments `totalOps` plus one category counter, so the
 *   budgets assert on renderer work, not on fixture setup.
 * - `measureText` is deterministic: width derives from the current `font`
 *   size only (same algorithm as the city-render-passes mock), never from a
 *   real text engine.
 * - any method outside the implemented surface is absent, so calling it throws
 *   a TypeError instead of silently recording nothing. If production code
 *   starts using a new canvas method, every test using this recorder fails
 *   loudly — extend the surface deliberately, never loosen an assertion.
 *
 * NEVER imported from `src/**` (`tests/scripts/perf-isolation.test.ts`
 * enforces zero production test instrumentation).
 */
export interface RenderWorkCounts {
  /** every recorded canvas method invocation (draw + state + measure) */
  totalOps: number;
  /** `drawImage` calls — sprite blits */
  drawImage: number;
  /** `fillText` + `strokeText` calls — labels and glyphs */
  text: number;
  /** `fillRect` + `clearRect` + `strokeRect` calls */
  rect: number;
  /** `fill` calls — committed path fills */
  fills: number;
  /** `stroke` calls — committed path strokes */
  strokes: number;
  /** `beginPath` calls — path construction starts */
  paths: number;
  /** `measureText` calls — layout queries (no pixels, still renderer work) */
  measureText: number;
  /** `save` + `restore` calls — state stack churn */
  saveRestore: number;
}

function emptyCounts(): RenderWorkCounts {
  return {
    totalOps: 0,
    drawImage: 0,
    text: 0,
    rect: 0,
    fills: 0,
    strokes: 0,
    paths: 0,
    measureText: 0,
    saveRestore: 0,
  };
}

export class RecordingCanvasContext {
  readonly counts = emptyCounts();

  // --- writable canvas state (accepted, never counted) ---
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 0;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  lineDashOffset = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  shadowColor = '';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  imageSmoothingEnabled = true;

  private bump(): void {
    this.counts.totalOps += 1;
  }

  // --- state stack ---
  save(): void {
    this.bump();
    this.counts.saveRestore += 1;
  }

  restore(): void {
    this.bump();
    this.counts.saveRestore += 1;
  }

  // --- transforms ---
  translate(): void {
    this.bump();
  }

  rotate(): void {
    this.bump();
  }

  scale(): void {
    this.bump();
  }

  setTransform(): void {
    this.bump();
  }

  resetTransform(): void {
    this.bump();
  }

  setLineDash(): void {
    this.bump();
  }

  getLineDash(): number[] {
    this.bump();
    return [];
  }

  // --- path construction ---
  beginPath(): void {
    this.bump();
    this.counts.paths += 1;
  }

  moveTo(): void {
    this.bump();
  }

  lineTo(): void {
    this.bump();
  }

  bezierCurveTo(): void {
    this.bump();
  }

  quadraticCurveTo(): void {
    this.bump();
  }

  arc(): void {
    this.bump();
  }

  arcTo(): void {
    this.bump();
  }

  ellipse(): void {
    this.bump();
  }

  rect(): void {
    this.bump();
  }

  closePath(): void {
    this.bump();
  }

  clip(): void {
    this.bump();
  }

  // --- path commit ---
  fill(): void {
    this.bump();
    this.counts.fills += 1;
  }

  stroke(): void {
    this.bump();
    this.counts.strokes += 1;
  }

  // --- rects ---
  fillRect(): void {
    this.bump();
    this.counts.rect += 1;
  }

  clearRect(): void {
    this.bump();
    this.counts.rect += 1;
  }

  strokeRect(): void {
    this.bump();
    this.counts.rect += 1;
  }

  // --- text ---
  fillText(): void {
    this.bump();
    this.counts.text += 1;
  }

  strokeText(): void {
    this.bump();
    this.counts.text += 1;
  }

  measureText(text: string): TextMetrics {
    this.bump();
    this.counts.measureText += 1;
    const fontSize = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? '10');
    const width = [...text].reduce((sum, character) => {
      if (character === 'i' || character === 'l' || character === ' ') return sum + fontSize * 0.28;
      if (character === 'W' || character === 'M') return sum + fontSize * 0.92;
      if (character.codePointAt(0)! > 0xffff) return sum + fontSize;
      return sum + fontSize * 0.58;
    }, 0);
    return { width } as TextMetrics;
  }

  // --- images ---
  drawImage(): void {
    this.bump();
    this.counts.drawImage += 1;
  }

  // --- hit regions / misc no-ops the path never calls are intentionally absent ---
}
