import { describe, expect, it } from 'vitest';
import {
  drawFortMarker,
  getFortMarkerImage,
  FORT_MARKER_SVG,
  CITADEL_MARKER_SVG,
  FORT_MARKER_SVG_BY_TIER,
} from '@/renderer/improvements/fort-marker';

class MockCanvasContext {
  operations: string[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  fillRect(): void { this.operations.push('fillRect'); }
  strokeRect(): void { this.operations.push('strokeRect'); }
  // deliberately NO drawImage — mirrors the node/vitest environment
}

const svgs = [
  ['fort', FORT_MARKER_SVG],
  ['citadel', CITADEL_MARKER_SVG],
] as const;

describe('fort / citadel improvement markers', () => {
  it.each(svgs)('%s SVG is a self-contained 48x48 improvement marker', (_tier, svg) => {
    expect(svg).toContain('viewBox="0 0 48 48"');
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toMatch(/<animate/i);
    expect(svg).not.toMatch(/<image/i);
    expect(svg).not.toMatch(/<foreignObject/i);
  });

  it('maps each tier to its own distinct payload', () => {
    expect(FORT_MARKER_SVG_BY_TIER.fort).toBe(FORT_MARKER_SVG);
    expect(FORT_MARKER_SVG_BY_TIER.citadel).toBe(CITADEL_MARKER_SVG);
    expect(FORT_MARKER_SVG).not.toBe(CITADEL_MARKER_SVG);
  });

  it('carries shared silhouette DNA (enclosure + front gate) with a stronger Citadel', () => {
    // Shared family: both are an angular enclosure with a central strongpoint and a front gate.
    expect(FORT_MARKER_SVG).toContain('cq-fort-berm');
    expect(FORT_MARKER_SVG).toContain('cq-fort-gate');
    expect(FORT_MARKER_SVG).toContain('cq-fort-blockhouse');

    // Citadel keeps the gate motif but adds masonry bastions, a gatehouse and a tall keep —
    // none of which the Fort has.
    expect(CITADEL_MARKER_SVG).toContain('cq-citadel-curtain');
    expect(CITADEL_MARKER_SVG).toContain('cq-citadel-gatehouse');
    expect(CITADEL_MARKER_SVG).toContain('cq-citadel-bastion-l');
    expect(CITADEL_MARKER_SVG).toContain('cq-citadel-bastion-r');
    expect(CITADEL_MARKER_SVG).toContain('cq-citadel-keep');
    expect(FORT_MARKER_SVG).not.toContain('cq-citadel-');

    // Larger silhouette: the Citadel's ground shadow is wider than the Fort's.
    const fortShadow = Number(/<ellipse[^>]*\srx="([\d.]+)"/.exec(FORT_MARKER_SVG)?.[1]);
    const citadelShadow = Number(/<ellipse[^>]*\srx="([\d.]+)"/.exec(CITADEL_MARKER_SVG)?.[1]);
    expect(citadelShadow).toBeGreaterThan(fortShadow);
  });

  it('returns null from getFortMarkerImage before preload (no Image API in tests)', () => {
    expect(getFortMarkerImage('fort')).toBeNull();
    expect(getFortMarkerImage('citadel')).toBeNull();
  });

  it('falls back to deterministic Canvas geometry and tags the tier', () => {
    const fortCtx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawFortMarker(fortCtx, 0, 0, 48, 'fort');
    const fortOps = (fortCtx as unknown as MockCanvasContext).operations;
    expect(fortOps).toContain('fort-marker:fort');
    expect(fortOps).not.toContain('fort-marker:citadel');
    expect(fortOps).toContain('fillRect');
    expect(fortOps).toContain('strokeRect');

    const citadelCtx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawFortMarker(citadelCtx, 0, 0, 48, 'citadel');
    const citadelOps = (citadelCtx as unknown as MockCanvasContext).operations;
    expect(citadelOps).toContain('fort-marker:citadel');
    expect(citadelOps).not.toContain('fort-marker:fort');
    expect(citadelOps).toContain('fillRect');
    expect(citadelOps).toContain('strokeRect');
  });
});
