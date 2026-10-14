import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawLegendaryWonderLandmarkGlyph } from '@/renderer/wonders/legendary-wonder-renderer';
import { LEGENDARY_WONDER_ART_IDS } from '@/renderer/wonders/legendary-wonder-art-catalog';
import { getLegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-catalog';
import type { LegendaryWonderLandmarkState } from '@/systems/legendary-wonder-landmark-types';
import { getLegendaryWonderArtImage } from '@/renderer/wonders/legendary-wonder-art-loader';

vi.mock('@/renderer/wonders/legendary-wonder-art-loader', () => ({ getLegendaryWonderArtImage: vi.fn() }));

const STUB_IMAGE = { tag: 'art' } as unknown as HTMLImageElement;

/** Records every canvas call by name; any method the bespoke drawings use (ellipse, curves, gradients...) is a no-op. */
function createMockCanvasContext(): MockCanvasContext {
  const operations: string[] = [];
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1 };
  return new Proxy({ operations } as unknown as MockCanvasContext, {
    get(target, prop: string) {
      if (prop === 'operations') return operations;
      if (prop in state) return state[prop];
      if (prop === 'drawImage') {
        return (_image: unknown, x: number, y: number, w: number, h: number) => { operations.push(`image:${x}:${y}:${w}:${h}`); };
      }
      return (..._args: unknown[]) => { operations.push(prop); };
    },
    set(_target, prop: string, value) { state[prop] = value; return true; },
  });
}

interface MockCanvasContext { operations: string[]; globalAlpha: number }

function draw(
  wonderId: string,
  options: { state?: LegendaryWonderLandmarkState; reducedMotion?: boolean } = {},
): MockCanvasContext {
  const ctx = createMockCanvasContext();
  drawLegendaryWonderLandmarkGlyph({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    cx: 80,
    cy: 90,
    radius: 12,
    metadata: getLegendaryWonderLandmarkMetadata(wonderId),
    state: options.state ?? 'completed',
    reducedMotion: options.reducedMotion === true,
    nowMs: 1000,
  });
  return ctx;
}

const images = (ctx: MockCanvasContext): string[] => ctx.operations.filter(op => op.startsWith('image:'));
const bespoke = (ctx: MockCanvasContext): string[] => ctx.operations.filter(op => op.startsWith('bespoke:'));

describe('legendary wonder production art on the map (#613)', () => {
  const lookup = vi.mocked(getLegendaryWonderArtImage);
  beforeEach(() => { lookup.mockReset(); lookup.mockReturnValue(null); });

  for (const id of LEGENDARY_WONDER_ART_IDS) {
    it(`${id}: draws its art instead of the canvas drawing once loaded`, () => {
      lookup.mockImplementation(wonderId => (wonderId === id ? STUB_IMAGE : null));
      const ctx = draw(id);
      expect(images(ctx)).toHaveLength(1);
      expect(bespoke(ctx)).toEqual([]);
    });

    it(`${id}: falls back to the canvas drawing while the art is missing or failed`, () => {
      const ctx = draw(id);
      expect(images(ctx)).toEqual([]);
      expect(bespoke(ctx)).toEqual([`bespoke:${id}-bespoke`]);
    });

    it(`${id}: shows the construction ghost, not finished art, while under construction`, () => {
      lookup.mockReturnValue(STUB_IMAGE);
      const ctx = draw(id, { state: 'under-construction' });
      expect(images(ctx)).toEqual([]);
      expect(bespoke(ctx)).toEqual([]);
      expect(ctx.operations).toContain('stroke');
    });
  }

  it('uses the same source whether or not reduced motion is on', () => {
    lookup.mockReturnValue(STUB_IMAGE);
    expect(images(draw('suez-canal', { reducedMotion: true }))).toEqual(images(draw('suez-canal', { reducedMotion: false })));
  });

  it('keeps the canvas drawing for a wonder that has no art, even when art is cached for others', () => {
    lookup.mockImplementation(wonderId => (wonderId === 'crystal-palace' ? STUB_IMAGE : null));
    const ctx = draw('eiffel-tower');
    expect(images(ctx)).toEqual([]);
    expect(bespoke(ctx)).toEqual(['bespoke:eiffel-tower-bespoke']);
  });

  it('asks the loader by wonder id', () => {
    draw('iron-arsenal');
    expect(lookup).toHaveBeenCalledWith('iron-arsenal');
  });

  it('draws a centred square inside the ambient-repaint reach', () => {
    lookup.mockReturnValue(STUB_IMAGE);
    for (const id of LEGENDARY_WONDER_ART_IDS) {
      const [op] = images(draw(id));
      const [, x, y, w, h] = op!.split(':').map(Number) as [number, number, number, number, number];
      const scale = getLegendaryWonderLandmarkMetadata(id).scale;
      expect(w, id).toBeCloseTo(h, 6);
      expect(x + w / 2, id).toBeCloseTo(80, 6);
      expect(y + h / 2, id).toBeCloseTo(90, 6);
      expect(w / 2, id).toBeLessThanOrEqual(12 * 3 * Math.max(1, scale));
      expect(w / 2, id).toBeGreaterThan(0);
    }
  });

  it('leaves the canvas state as it found it', () => {
    lookup.mockReturnValue(STUB_IMAGE);
    const ctx = draw('palace-of-the-sun');
    expect(ctx.globalAlpha).toBe(1);
  });
});
