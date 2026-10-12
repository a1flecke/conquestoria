// Only immutable, faction-neutral catalog SVGs belong here. Domain loaders commit
// the returned image to their canvas caches before announcing asset readiness.
const images = new Map<string, Promise<HTMLImageElement>>();

export function loadStaticSvgImage(svg: string): Promise<HTMLImageElement> {
  const existing = images.get(svg);
  if (existing) return existing;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const cleanup = (): void => {
      URL.revokeObjectURL(url);
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('Static SVG image load failed')); };
    try { image.src = url; }
    catch (error) { cleanup(); reject(error); }
  }).catch(error => {
    images.delete(svg);
    throw error;
  });
  images.set(svg, promise);
  return promise;
}
