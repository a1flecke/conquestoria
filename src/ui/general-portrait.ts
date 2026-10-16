import type { GeneralPresentation } from '@/systems/great-general-presentation';
import { resolveAppAssetUrl } from '@/renderer/asset-url';
import { CREST_FIELDS, GENERAL_GLYPHS } from '@/ui/general-portrait-glyphs';

/**
 * #889: draws a General's crest from the canonical `GeneralPresentation`.
 *
 * The result is a small inline-SVG element built with `createElementNS` (never `innerHTML`; no
 * game string reaches markup). It is decorative-plus-identifying: `role="img"` with the General's
 * name in the label, so a screen reader hears "Julius Caesar, crest", and the visible text next
 * to it (the name) remains the real content. It never animates, so reduced motion needs no gate.
 *
 * Graceful fallback: if the SVG cannot be built for any reason (unknown motif from a newer save,
 * a DOM without namespaced elements) the same element is returned with the legacy emoji as text,
 * so a surface never shows an empty hole where the portrait should be.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#1f1a14';
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export interface GeneralPortraitOptions {
  /** Rendered edge in CSS px (the crest keeps its 48:56 shape). */
  readonly size: number;
  /** The General's name, for the accessible label. */
  readonly name: string;
}

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

/** Only well-formed hex colours reach an attribute; anything else degrades to a neutral grey. */
function safeColor(value: string): string {
  return COLOR_RE.test(value) ? value : '#6a6a7a';
}

let clipSequence = 0;

function appendGlyph(svg: SVGElement, presentation: GeneralPresentation): void {
  const glyph = GENERAL_GLYPHS[presentation.motif];
  if (!glyph) throw new Error(`unknown crest motif: ${presentation.motif}`);
  const secondary = safeColor(presentation.secondary);
  const primary = safeColor(presentation.primary);
  const group = svgEl('g', { transform: 'translate(10.800 10.800) scale(1.100)', 'data-crest-emblem': 'true' });
  for (const part of glyph) {
    if (part.kind === 'stroke') {
      group.appendChild(svgEl('path', {
        d: part.d, fill: 'none', stroke: secondary, 'stroke-width': String(part.width ?? 2), 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }));
    } else {
      group.appendChild(svgEl('path', { d: part.d, fill: part.kind === 'cut' ? primary : secondary, stroke: part.kind === 'cut' ? 'none' : INK, 'stroke-width': '0.35' }));
    }
  }
  svg.appendChild(group);
}

function buildCrestSvg(presentation: GeneralPresentation): SVGElement {
  const field = CREST_FIELDS[presentation.shape];
  if (!field) throw new Error(`unknown crest shape: ${presentation.shape}`);
  const primary = safeColor(presentation.primary);
  const secondary = safeColor(presentation.secondary);

  const svg = svgEl('svg', { viewBox: '0 0 48 56', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false' });
  svg.appendChild(svgEl('path', { d: field, fill: primary, stroke: INK, 'stroke-width': '1.6', 'stroke-linejoin': 'round' }));

  if (presentation.portrait) {
    // The portrait fills the crest field (clipped to its shape). If the file is missing or fails to decode, the emblem
    // takes its place, so a General never shows an empty frame.
    const clipId = `general-portrait-clip-${++clipSequence}`;
    const defs = svgEl('defs', {});
    const clip = svgEl('clipPath', { id: clipId });
    clip.appendChild(svgEl('path', { d: field }));
    defs.appendChild(clip);
    svg.appendChild(defs);
    const image = svgEl('image', {
      href: resolveAppAssetUrl(presentation.portrait.path), x: '0', y: '0', width: '48', height: '56',
      preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${clipId})`, 'data-portrait-image': 'true',
    });
    image.addEventListener('error', () => {
      image.remove();
      try { appendGlyph(svg, presentation); } catch { /* the field alone is still a valid crest */ }
      const holder = svg.parentElement;
      if (holder) holder.dataset.portraitState = 'crest';
    }, { once: true }); // a failed image must swap to the emblem exactly once
    svg.appendChild(image);
    svg.appendChild(svgEl('path', { d: field, fill: 'none', stroke: INK, 'stroke-width': '1.6', 'stroke-linejoin': 'round' }));
    svg.appendChild(svgEl('path', { d: field, fill: 'none', stroke: secondary, 'stroke-width': '0.9', 'stroke-opacity': '0.7', transform: 'translate(24 28) scale(0.94) translate(-24 -28)' }));
  } else {
    svg.appendChild(svgEl('path', { d: field, fill: 'none', stroke: secondary, 'stroke-width': '0.9', 'stroke-opacity': '0.55', transform: 'translate(24 28) scale(0.9) translate(-24 -28)' }));
    appendGlyph(svg, presentation);
  }

  // Era tier: 1-4 pips so an officer's era is legible without reading the label (on a dark plate so they read over a portrait).
  const count = presentation.eraTier;
  const plateWidth = count * 5 + 3;
  svg.appendChild(svgEl('rect', { x: String(24 - plateWidth / 2), y: '41', width: String(plateWidth), height: '6', rx: '3', fill: INK, 'fill-opacity': presentation.portrait ? '0.75' : '0' }));
  const pips = svgEl('g', { fill: secondary, stroke: INK, 'stroke-width': '0.4' });
  for (let i = 0; i < count; i++) {
    const x = 24 + (i - (count - 1) / 2) * 5;
    pips.appendChild(svgEl('circle', { cx: String(x), cy: '44', r: '1.700' }));
  }
  svg.appendChild(pips);
  return svg;
}

export function createGeneralPortrait(presentation: GeneralPresentation, options: GeneralPortraitOptions): HTMLElement {
  const holder = document.createElement('span');
  holder.dataset.generalPortrait = presentation.generalId;
  holder.dataset.portraitSource = presentation.source;
  holder.setAttribute('role', 'img');
  holder.setAttribute('aria-label', `${options.name}, ${presentation.portrait ? 'portrait' : 'crest'}`);
  const height = Math.round(options.size * 56 / 48);
  holder.style.cssText = `display:inline-block;flex:none;width:${options.size}px;height:${height}px;line-height:${height}px;text-align:center;vertical-align:middle;`;
  try {
    holder.appendChild(buildCrestSvg(presentation));
    holder.dataset.portraitState = presentation.portrait ? 'portrait' : 'crest';
  } catch {
    holder.textContent = presentation.fallbackIcon;
    holder.dataset.portraitState = 'fallback';
    holder.style.fontSize = `${Math.round(options.size * 0.7)}px`;
  }
  return holder;
}
