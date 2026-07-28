import { describe, it, expect } from 'vitest';
import { namespaceSvgIds, getAnimatedBuildingIconHtml } from '@/ui/city-panel-building-icon';
import { NEUTRAL_FACTION_PALETTE } from '@/renderer/sprites/sprite-system';

describe('namespaceSvgIds', () => {
  it('suffixes a plain id attribute', () => {
    const svg = '<svg><defs><clipPath id="tickerClip"><rect/></clipPath></defs></svg>';
    const result = namespaceSvgIds(svg, 'bank-0');
    expect(result).toContain('id="tickerClip-bank-0"');
    expect(result).not.toContain('id="tickerClip"');
  });

  it('rewrites a matching url(#id) reference to the same suffixed id', () => {
    const svg = '<svg><defs><clipPath id="tickerClip"><rect/></clipPath></defs><g clip-path="url(#tickerClip)"></g></svg>';
    const result = namespaceSvgIds(svg, 'bank-0');
    expect(result).toContain('clip-path="url(#tickerClip-bank-0)"');
  });

  it('rewrites a matching href="#id" reference to the same suffixed id', () => {
    const svg = '<svg><defs><circle id="dot"/></defs><use href="#dot"></use></svg>';
    const result = namespaceSvgIds(svg, 'granary-2');
    expect(result).toContain('href="#dot-granary-2"');
  });

  it('namespaces multiple distinct ids independently, without cross-contamination', () => {
    const svg = '<svg><defs><clipPath id="a"/><circle id="b"/></defs><g clip-path="url(#a)"></g><use href="#b"></use></svg>';
    const result = namespaceSvgIds(svg, 'x');
    expect(result).toContain('id="a-x"');
    expect(result).toContain('id="b-x"');
    expect(result).toContain('url(#a-x)');
    expect(result).toContain('href="#b-x"');
  });

  it('leaves markup with no ids unchanged', () => {
    const svg = '<svg><rect fill="#fff"/></svg>';
    expect(namespaceSvgIds(svg, 'anything')).toBe(svg);
  });

  it('two different suffixes on the same raw markup produce non-colliding output', () => {
    const svg = '<svg><defs><clipPath id="tickerClip"><rect/></clipPath></defs><g clip-path="url(#tickerClip)"></g></svg>';
    const first = namespaceSvgIds(svg, 'stock_exchange-0');
    const second = namespaceSvgIds(svg, 'stock_exchange-1');
    expect(first).not.toBe(second);
    const firstId = /id="([^"]+)"/.exec(first)?.[1];
    const secondId = /id="([^"]+)"/.exec(second)?.[1];
    expect(firstId).not.toBe(secondId);
  });
});

describe('getAnimatedBuildingIconHtml', () => {
  it('renders the animated wrapper for a building present in BUILDING_SPRITE_CATALOG', () => {
    const html = getAnimatedBuildingIconHtml('granary', NEUTRAL_FACTION_PALETTE, 'city-a:granary');
    expect(html).toContain('cq-sprite-wrap');
    expect(html).toContain('cq-v2');
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('data-kind="building"');
  });

  it('does not throw and falls back to the production-icon emoji for a legendary-wonder id with no catalog entry', () => {
    expect(() => getAnimatedBuildingIconHtml('grand-canal', NEUTRAL_FACTION_PALETTE, 'city-a:grand-canal')).not.toThrow();
    const html = getAnimatedBuildingIconHtml('grand-canal', NEUTRAL_FACTION_PALETTE, 'city-a:grand-canal');
    expect(html).toContain('🏗️');
    expect(html).not.toContain('cq-sprite-wrap');
  });

  it('renders a covered wonder (pyramids) as an animated sprite, not the fallback', () => {
    const html = getAnimatedBuildingIconHtml('pyramids', NEUTRAL_FACTION_PALETTE, 'city-a:pyramids');
    expect(html).toContain('cq-sprite-wrap');
    expect(html).not.toContain('🏗️');
  });

  it('gives two different phaseKeys two different --phase values, so identical building types desync', () => {
    const a = getAnimatedBuildingIconHtml('granary', NEUTRAL_FACTION_PALETTE, 'city-a:granary');
    const b = getAnimatedBuildingIconHtml('granary', NEUTRAL_FACTION_PALETTE, 'city-b:granary');
    const phaseOf = (html: string) => /--phase:([\d.]+)/.exec(html)?.[1];
    expect(phaseOf(a)).not.toBe(phaseOf(b));
  });

  it('namespaces ids so two different buildings rendered together never collide', () => {
    const a = getAnimatedBuildingIconHtml('stock_exchange', NEUTRAL_FACTION_PALETTE, 'city-a:stock_exchange');
    const b = getAnimatedBuildingIconHtml('bank', NEUTRAL_FACTION_PALETTE, 'city-a:bank');
    const idsOf = (html: string) => [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const combined = [...idsOf(a), ...idsOf(b)];
    expect(new Set(combined).size).toBe(combined.length);
  });
});
