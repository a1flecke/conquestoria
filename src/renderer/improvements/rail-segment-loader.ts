import { getRailSegmentSvg } from './rail-segment-marker';

let cachedImage: HTMLImageElement | null = null;

export async function preloadRailSegment(): Promise<void> {
  const blob = new Blob([getRailSegmentSvg()], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cachedImage = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export function getRailSegmentImage(): HTMLImageElement | null {
  return cachedImage;
}
