import type { WonderAtlasEntry } from '@/systems/wonder-atlas-presentation';
import type { WonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export interface WonderVignetteOptions {
  reducedMotion?: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function createSvgElement(name: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

function appendShape(svg: SVGSVGElement, visual: WonderVisualDefinition, reducedMotion: boolean): void {
  const base = createSvgElement('circle');
  base.setAttribute('cx', '50');
  base.setAttribute('cy', '50');
  base.setAttribute('r', '34');
  base.setAttribute('fill', visual.palette.base);
  base.setAttribute('opacity', '0.92');
  svg.appendChild(base);

  const accent = createSvgElement('path');
  const shapeByVignette: Record<string, string> = {
    aurora: 'M18 56 C34 22, 54 82, 82 28',
    bay: 'M18 56 C30 42, 46 66, 62 50 S80 54, 88 40',
    bones: 'M24 66 L74 34 M32 30 L80 72',
    canyon: 'M18 36 L40 62 L55 38 L82 68',
    crystal: 'M50 16 L74 46 L58 84 L28 66 L34 34 Z',
    falls: 'M36 18 L66 18 L58 78 L42 78 Z',
    forest: 'M50 16 L74 54 H62 L80 78 H20 L38 54 H26 Z',
    islands: 'M28 60 L42 34 L56 60 M48 54 L66 24 L82 54',
    lake: 'M20 55 C32 35, 68 35, 80 55 C68 76, 32 76, 20 55',
    mountain: 'M18 74 L46 24 L58 48 L70 30 L88 74 Z',
    reef: 'M25 70 C28 42, 42 64, 42 34 M50 74 C50 40, 66 64, 72 34',
    ruins: 'M24 74 H78 M32 74 V32 H70 V74 M44 74 V44 H58 V74',
    sands: 'M16 58 C34 42, 50 74, 84 50 M18 72 C42 54, 58 82, 86 66',
    storm: 'M56 14 L28 54 H48 L38 86 L76 42 H54 Z',
    volcano: 'M18 78 L40 26 L50 54 L60 26 L84 78 Z',
  };
  accent.setAttribute('d', shapeByVignette[visual.vignette] ?? shapeByVignette.crystal);
  accent.setAttribute('fill', 'none');
  accent.setAttribute('stroke', visual.palette.accent);
  accent.setAttribute('stroke-width', '7');
  accent.setAttribute('stroke-linecap', 'round');
  accent.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(accent);

  const glow = createSvgElement('circle');
  glow.setAttribute('cx', '50');
  glow.setAttribute('cy', '50');
  glow.setAttribute('r', reducedMotion ? '38' : '41');
  glow.setAttribute('fill', 'none');
  glow.setAttribute('stroke', visual.palette.glow);
  glow.setAttribute('stroke-width', '3');
  glow.setAttribute('opacity', reducedMotion ? '0.45' : '0.72');
  svg.appendChild(glow);
}

export function createWonderVisualVignette(
  name: string,
  visual: WonderVisualDefinition,
  options: WonderVignetteOptions & { kind?: 'natural' | 'legendary' } = {},
): HTMLElement {
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
  const wrapper = document.createElement('div');
  wrapper.dataset.vignetteMotion = reducedMotion ? 'static' : 'ambient';
  wrapper.style.cssText = 'position:relative;width:118px;height:118px;flex:0 0 118px;display:grid;place-items:center;';

  const svg = createSvgElement('svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('role', 'img');
  svg.style.cssText = `width:112px;height:112px;filter:drop-shadow(0 0 12px ${visual.palette.glow});`;
  svg.setAttribute('aria-label', `${name} vignette`);
  appendShape(svg, visual, reducedMotion || options.kind === 'legendary');
  wrapper.appendChild(svg);

  const glyph = document.createElement('div');
  glyph.textContent = visual.medallionGlyph;
  glyph.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;font-size:30px;font-weight:700;color:white;text-shadow:0 2px 8px rgba(0,0,0,0.65);';
  wrapper.appendChild(glyph);

  return wrapper;
}

export function createWonderVignette(entry: WonderAtlasEntry, options: WonderVignetteOptions = {}): HTMLElement {
  return createWonderVisualVignette(entry.name, entry.visual, { ...options, kind: entry.kind });
}
