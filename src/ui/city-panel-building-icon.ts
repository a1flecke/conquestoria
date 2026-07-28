export function namespaceSvgIds(svg: string, suffix: string): string {
  const ids = new Set<string>();
  const idPattern = /\bid="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = idPattern.exec(svg)) !== null) {
    ids.add(match[1]);
  }
  if (ids.size === 0) return svg;

  let result = svg;
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result
      .replace(new RegExp(`\\bid="${escaped}"`, 'g'), `id="${id}-${suffix}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${id}-${suffix})`)
      .replace(new RegExp(`href="#${escaped}"`, 'g'), `href="#${id}-${suffix}"`);
  }
  return result;
}
