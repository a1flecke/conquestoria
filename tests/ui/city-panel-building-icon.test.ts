import { describe, it, expect } from 'vitest';
import { namespaceSvgIds } from '@/ui/city-panel-building-icon';

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
