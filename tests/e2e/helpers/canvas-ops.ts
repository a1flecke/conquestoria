export interface RectSnapshot { x: number; y: number; width: number; height: number; }
export interface MatrixSnapshot { a: number; b: number; c: number; d: number; e: number; f: number; }
export interface ViewportPoint { x: number; y: number; }

export interface ParsedDrawImage {
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
  dx: number;
  dy: number;
  dw?: number;
  dh?: number;
}

export function parseDrawImage(args: unknown[]): ParsedDrawImage {
  const values = args.slice(1).map(value => Number(value));
  if (values.length === 2) return { dx: values[0]!, dy: values[1]! };
  if (values.length === 4) return { dx: values[0]!, dy: values[1]!, dw: values[2]!, dh: values[3]! };
  if (values.length === 8) {
    return {
      sx: values[0]!, sy: values[1]!, sw: values[2]!, sh: values[3]!,
      dx: values[4]!, dy: values[5]!, dw: values[6]!, dh: values[7]!,
    };
  }
  throw new Error(`Unsupported drawImage overload with ${values.length} numeric arguments.`);
}

function transformPoint(point: ViewportPoint, matrix: MatrixSnapshot): ViewportPoint {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

export function normalizeImageBounds(input: {
  rect: RectSnapshot;
  transform: MatrixSnapshot;
  backing: { width: number; height: number };
  css: RectSnapshot;
}): { polygon: ViewportPoint[]; bounds: RectSnapshot } {
  const { rect, transform, backing, css } = input;
  const scaleX = css.width / backing.width;
  const scaleY = css.height / backing.height;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  const polygon = corners.map(corner => {
    const transformed = transformPoint(corner, transform);
    return { x: css.x + transformed.x * scaleX, y: css.y + transformed.y * scaleY };
  });
  const xs = polygon.map(point => point.x);
  const ys = polygon.map(point => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { polygon, bounds: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y } };
}

export type RecorderOperation = { kind: string; canvasId: string; [key: string]: unknown };
export type CaptureFilter = { canvasId?: string };

export function createOperationRecorder({ maxOperations }: { maxOperations: number }) {
  let active = false;
  let sessionId = 0;
  let overflowed = false;
  let filter: CaptureFilter = {};
  let operations: RecorderOperation[] = [];

  const matches = (operation: RecorderOperation): boolean => (
    !filter.canvasId || operation.canvasId === filter.canvasId
  );

  return {
    start(nextFilter: CaptureFilter): void {
      active = true;
      sessionId += 1;
      overflowed = false;
      operations = [];
      filter = structuredClone(nextFilter);
    },
    record(operation: RecorderOperation): void {
      if (!active || !matches(operation)) return;
      if (operations.length >= maxOperations) {
        overflowed = true;
        active = false;
        return;
      }
      operations.push(structuredClone(operation));
    },
    freeze(): void { active = false; },
    snapshot(): { sessionId: number; overflowed: boolean; operations: RecorderOperation[] } {
      return { sessionId, overflowed, operations: structuredClone(operations) };
    },
  };
}
