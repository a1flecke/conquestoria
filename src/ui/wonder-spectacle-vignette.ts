import { getWonderSpectacleRecipe } from '@/systems/wonder-spectacle/presentation';
import type { WonderSpectaclePrimitive, WonderSpectacleRenderMode } from '@/systems/wonder-spectacle/types';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export const SVG_WONDER_SPECTACLE_PRIMITIVES = [
  'heatGlow',
  'smokePlume',
  'embers',
  'waterFlow',
  'sparkle',
  'lightBands',
  'mist',
  'lightning',
  'fireflies',
  'leafDrift',
  'sandRipple',
  'stonePulse',
  'crystalGleam',
  'fossilDust',
  'deepWaterAura',
  'ruinGlimmer',
] as const satisfies readonly WonderSpectaclePrimitive[];

export interface WonderSpectacleVignetteOptions {
  wonderId: string;
  name: string;
  mode: Extract<WonderSpectacleRenderMode, 'codex-ambient' | 'codex-static' | 'reveal-amplified' | 'reveal-static'>;
  reducedMotion: boolean;
}

function createSvgElement(name: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

function appendPrimitive(
  svg: SVGSVGElement,
  primitive: WonderSpectaclePrimitive,
  amplified: boolean,
  motionEnabled: boolean,
): void {
  const node = createSvgElement(primitive === 'lightning' ? 'path' : 'circle');
  node.setAttribute('data-wonder-spectacle-primitive', primitive);
  node.setAttribute('data-wonder-spectacle-variant', amplified ? 'amplified' : 'ambient');

  if (node.tagName === 'path') {
    node.setAttribute('d', 'M58 12 L36 48 H52 L40 88 L72 42 H56 Z');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', amplified ? '7' : '5');
  } else {
    node.setAttribute('cx', primitive === 'embers' || primitive === 'sparkle' ? '68' : '50');
    node.setAttribute('cy', primitive === 'smokePlume' || primitive === 'mist' ? '28' : '50');
    node.setAttribute('r', amplified ? '34' : '25');
    node.setAttribute('fill', 'currentColor');
    node.setAttribute('opacity', amplified ? '0.34' : '0.22');
  }

  if (motionEnabled) {
    const pulse = createSvgElement('animate');
    pulse.setAttribute('attributeName', 'opacity');
    pulse.setAttribute('values', amplified ? '0.22;0.58;0.22' : '0.14;0.34;0.14');
    pulse.setAttribute('dur', amplified ? '1.6s' : '3.2s');
    pulse.setAttribute('repeatCount', 'indefinite');
    node.appendChild(pulse);
  }

  svg.appendChild(node);
}

export function createWonderSpectacleVignette(options: WonderSpectacleVignetteOptions): HTMLElement {
  const recipe = getWonderSpectacleRecipe(options.wonderId);
  const visual = getWonderVisualDefinition(options.wonderId);
  const motionEnabled = !options.reducedMotion && !options.mode.endsWith('static');
  const wrapper = document.createElement('div');
  wrapper.dataset.wonderSpectacleMode = options.mode;
  wrapper.dataset.vignetteMotion = motionEnabled
    ? options.mode === 'reveal-amplified' ? 'amplified' : 'ambient'
    : 'static';
  wrapper.style.cssText = [
    'position:relative',
    'width:118px',
    'height:118px',
    'flex:0 0 118px',
    'display:grid',
    'place-items:center',
    `color:${visual.palette.glow}`,
  ].join(';');

  const svg = createSvgElement('svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', motionEnabled ? `${options.name} spectacle animation` : `${options.name} spectacle image`);
  svg.style.cssText = `width:100%;height:100%;filter:drop-shadow(0 0 12px ${visual.palette.glow});`;

  const base = createSvgElement('circle');
  base.setAttribute('cx', '50');
  base.setAttribute('cy', '50');
  base.setAttribute('r', '32');
  base.setAttribute('fill', visual.palette.base);
  svg.appendChild(base);

  const primitives = options.mode.startsWith('reveal')
    ? recipe?.revealPrimitives ?? []
    : recipe?.codexPrimitives ?? [];
  for (const primitive of primitives) {
    appendPrimitive(svg, primitive, options.mode === 'reveal-amplified', motionEnabled);
  }

  wrapper.appendChild(svg);
  return wrapper;
}
