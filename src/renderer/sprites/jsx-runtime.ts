// Custom JSX-to-string runtime for SVG sprite components.
// TypeScript looks for this file when jsxImportSource resolves to this directory.

type Child = string | false | null | undefined;
type Props = Record<string, unknown>;

const CAMEL_TO_SVG: Record<string, string> = {
  className:        'class',
  strokeWidth:      'stroke-width',
  strokeLinecap:    'stroke-linecap',
  strokeLinejoin:   'stroke-linejoin',
  strokeDasharray:  'stroke-dasharray',
  strokeOpacity:    'stroke-opacity',
  fillOpacity:      'fill-opacity',
  textAnchor:       'text-anchor',
  fontFamily:       'font-family',
  fontSize:         'font-size',
  patternUnits:     'patternUnits',  // SVG attribute stays camelCase
  viewBox:          'viewBox',       // SVG attribute stays camelCase
};

function serialize(val: unknown): string {
  if (typeof val === 'string') return val.replace(/"/g, '&quot;');
  if (typeof val === 'number') return String(val);
  return '';
}

function flatChildren(children: unknown): string {
  if (Array.isArray(children)) {
    return (children as Child[]).flat(Infinity as 1).map(c => (c === false || c == null ? '' : String(c))).join('');
  }
  return children === false || children == null ? '' : String(children);
}

export function jsx(
  tag: string | ((props: Props) => string),
  props: Props | null,
): string {
  const p = props ?? {};
  if (typeof tag === 'function') {
    // Normalize children to a string before calling function components so they
    // don't have to handle the string[] case themselves.
    const normalized = p.children !== undefined
      ? { ...p, children: flatChildren(p.children) }
      : p;
    return tag(normalized);
  }

  const children = flatChildren(p.children);
  const attrs = Object.entries(p)
    .filter(([k]) => k !== 'children' && p[k] !== undefined && p[k] !== false && p[k] !== null)
    .map(([k, v]) => ` ${CAMEL_TO_SVG[k] ?? k}="${serialize(v)}"`)
    .join('');

  return `<${tag}${attrs}>${children}</${tag}>`;
}

export const jsxs = jsx;

export function Fragment({ children }: { children?: unknown }): string {
  return flatChildren(children);
}

// JSX type declarations — tells TypeScript that JSX expressions produce strings
export namespace JSX {
  export type Element = string;
  export interface IntrinsicElements {
    [tag: string]: Props & { children?: Element | (Element | false | null | undefined)[] };
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
}
